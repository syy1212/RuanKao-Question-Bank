/**
 * 章节列表 API
 * GET /api/chapters
 * 
 * 返回所有章节及其题目数量
 */
import { getChaptersWithCount } from '../_shared/question.service.js';

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

    try {
        const chapters = await getChaptersWithCount(env);

        return new Response(
            JSON.stringify(chapters),
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('获取章节失败:', error);

        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: corsHeaders }
        );
    }
}
