/**
 * 导入服务
 * 处理 Markdown 题库导入的业务逻辑
 */
const { supabase } = require('../supabase/client');
const chapterRepo = require('../repositories/chapter.repo');
const questionRepo = require('../repositories/question.repo');
const optionRepo = require('../repositories/option.repo');
const { parseMarkdown } = require('./markdown.service');

/**
 * 上传文件到 Storage
 */
async function uploadToStorage(buffer, filename) {
    const timestamp = Date.now();
    const storagePath = `markdown/${timestamp}-${filename}`;

    const { error } = await supabase.storage
        .from('Question Bank')
        .upload(storagePath, buffer, {
            contentType: 'text/markdown',
            upsert: false
        });

    if (error) {
        console.warn('⚠️ Storage 上传失败:', error.message);
        return null;
    }

    console.log(`☁️ 已上传到 Storage: ${storagePath}`);
    return storagePath;
}

/**
 * 导入 Markdown 题库
 */
async function importMarkdown(buffer, filename) {
    const content = buffer.toString('utf-8');
    console.log(`📤 收到文件: ${filename} (${buffer.length} bytes)`);

    // 1. 解析 Markdown
    const { chapter, questions, stats } = parseMarkdown(content, filename);
    console.log(`📝 解析完成: ${chapter.code}, ${stats.parsed} 题, 去重后 ${stats.unique} 题`);

    if (stats.invalidAnswers > 0) {
        console.warn(`⚠️ ${stats.invalidAnswers} 道题答案无效`);
    }

    if (questions.length === 0) {
        throw new Error('未能解析出有效题目，请检查 Markdown 格式');
    }

    // 2. 上传到 Storage
    const storagePath = await uploadToStorage(buffer, filename);

    // 3. 入库章节
    const chapterData = await chapterRepo.upsert({
        code: chapter.code,
        title: chapter.title,
        source_file: storagePath || filename
    });
    console.log(`📚 章节已入库: ${chapter.code} (ID: ${chapterData.id})`);

    // 4. 入库题目
    const questionsPayload = questions.map(q => ({
        chapter_id: chapterData.id,
        number: q.number,
        question_text: q.question_text,
        answer: q.answer,
        explanation: q.explanation,
        rich_content: q.rich_content || null
    }));

    const importedCount = await questionRepo.upsertBatch(questionsPayload);
    console.log(`✅ 题目已入库: ${importedCount} 道`);

    // 5. 入库选项
    const questionIdMap = await questionRepo.getIdMapByChapterId(chapterData.id);
    const optionsPayload = [];

    for (const q of questions) {
        const questionId = questionIdMap[q.number];
        if (!questionId) continue;

        for (const [label, content] of Object.entries(q.options)) {
            optionsPayload.push({ question_id: questionId, label, content });
        }
    }

    await optionRepo.upsertBatch(optionsPayload);
    console.log(`✅ 选项已入库: ${optionsPayload.length} 条`);

    return {
        success: true,
        chapter: chapter.code,
        title: chapter.title,
        imported: importedCount,
        options: optionsPayload.length,
        stats,
        storagePath
    };
}

module.exports = { importMarkdown, uploadToStorage };
