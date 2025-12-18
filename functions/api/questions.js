/**
 * 题目查询 API
 * GET /api/questions?chapter=ch05
 * 
 * 返回指定章节的所有题目
 */
import { getQuestionsByChapter } from '../_shared/question.service.js';

/**
 * 处理请求
 */
export async function onRequest(context) {
    const { request, env } = context;

    // 添加 CORS 头
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // 仅允许 GET 请求
    if (request.method !== 'GET') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: corsHeaders }
        );
    }

    // 解析查询参数
    const url = new URL(request.url);
    const chapterCode = url.searchParams.get('chapter');

    if (!chapterCode) {
        return new Response(
            JSON.stringify({ error: '缺少 chapter 参数' }),
            { status: 400, headers: corsHeaders }
        );
    }

    try {
        const result = await getQuestionsByChapter(env, chapterCode);

        if (!result) {
            return new Response(
                JSON.stringify({ error: `未找到章节: ${chapterCode}` }),
                { status: 404, headers: corsHeaders }
            );
        }

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('获取题目失败:', error);

        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: corsHeaders }
        );
    }
}
