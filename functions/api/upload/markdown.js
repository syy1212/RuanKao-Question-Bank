/**
 * Markdown 上传导入 API
 * POST /api/upload/markdown
 * 
 * 接收 Markdown 文件，解析并导入到数据库
 * 
 * 注意：边缘函数对请求体大小有限制（通常 1MB）
 * 大文件建议改用前端直传 Supabase Storage
 */
import { getSupabase } from '../../_shared/supabase.js';
import { parseMarkdown } from '../../_shared/markdown.service.js';

/**
 * 处理请求
 */
export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // 仅允许 POST 请求
    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ success: false, error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders }
        );
    }

    try {
        // 解析 multipart/form-data
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return new Response(
                JSON.stringify({ success: false, error: '未上传文件' }),
                { status: 400, headers: corsHeaders }
            );
        }

        // 检查文件类型
        if (!file.name.endsWith('.md')) {
            return new Response(
                JSON.stringify({ success: false, error: '只支持 .md 文件' }),
                { status: 400, headers: corsHeaders }
            );
        }

        // 读取文件内容
        const content = await file.text();
        const filename = file.name;

        console.log(`📤 收到文件: ${filename} (${content.length} bytes)`);

        // 解析 Markdown
        const { chapter, questions, stats } = parseMarkdown(content, filename);
        console.log(`📝 解析完成: ${chapter.code}, ${stats.parsed} 题, 去重后 ${stats.unique} 题`);

        if (questions.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: '未能解析出有效题目，请检查 Markdown 格式' }),
                { status: 400, headers: corsHeaders }
            );
        }

        // 获取 Supabase 客户端
        const supabase = getSupabase(env);

        // 1. 入库章节（使用 REST API 进行 upsert）
        const chapterResponse = await fetch(`${supabase.url}/rest/v1/chapters`, {
            method: 'POST',
            headers: {
                'apikey': supabase.key,
                'Authorization': `Bearer ${supabase.key}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify({
                code: chapter.code,
                title: chapter.title,
                source_file: filename
            })
        });

        if (!chapterResponse.ok) {
            const error = await chapterResponse.text();
            throw new Error(`章节入库失败: ${error}`);
        }

        const [chapterData] = await chapterResponse.json();
        console.log(`📚 章节已入库: ${chapter.code} (ID: ${chapterData.id})`);

        // 2. 入库题目（批量 upsert）
        const questionsPayload = questions.map(q => ({
            chapter_id: chapterData.id,
            number: q.number,
            question_text: q.question_text,
            answer: q.answer,
            explanation: q.explanation,
            rich_content: q.rich_content || null
        }));

        // 分批处理（每批 50 条）
        const batchSize = 50;
        let importedCount = 0;

        for (let i = 0; i < questionsPayload.length; i += batchSize) {
            const batch = questionsPayload.slice(i, i + batchSize);

            const questionsResponse = await fetch(`${supabase.url}/rest/v1/questions`, {
                method: 'POST',
                headers: {
                    'apikey': supabase.key,
                    'Authorization': `Bearer ${supabase.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(batch)
            });

            if (!questionsResponse.ok) {
                console.warn(`⚠️ 批次 ${Math.floor(i / batchSize) + 1} 插入警告:`, await questionsResponse.text());
            }

            importedCount += batch.length;
        }

        console.log(`✅ 题目已入库: ${importedCount} 道`);

        // 3. 获取题目 ID 映射并入库选项
        const idMapResponse = await fetch(
            `${supabase.url}/rest/v1/questions?chapter_id=eq.${chapterData.id}&select=id,number`,
            {
                headers: {
                    'apikey': supabase.key,
                    'Authorization': `Bearer ${supabase.key}`
                }
            }
        );

        const idMapData = await idMapResponse.json();
        const questionIdMap = {};
        idMapData.forEach(q => { questionIdMap[q.number] = q.id; });

        // 构建选项数据
        const optionsPayload = [];
        for (const q of questions) {
            const questionId = questionIdMap[q.number];
            if (!questionId) continue;

            for (const [label, optContent] of Object.entries(q.options)) {
                optionsPayload.push({ question_id: questionId, label, content: optContent });
            }
        }

        // 批量插入选项
        for (let i = 0; i < optionsPayload.length; i += 100) {
            const batch = optionsPayload.slice(i, i + 100);

            await fetch(`${supabase.url}/rest/v1/question_options`, {
                method: 'POST',
                headers: {
                    'apikey': supabase.key,
                    'Authorization': `Bearer ${supabase.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(batch)
            });
        }

        console.log(`✅ 选项已入库: ${optionsPayload.length} 条`);

        return new Response(
            JSON.stringify({
                success: true,
                chapter: chapter.code,
                title: chapter.title,
                imported: importedCount,
                options: optionsPayload.length,
                stats
            }),
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error('❌ 导入失败:', error);

        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: corsHeaders }
        );
    }
}
