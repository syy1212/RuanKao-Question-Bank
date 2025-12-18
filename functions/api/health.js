/**
 * 健康检查 API
 * GET /api/health
 * 
 * 返回服务状态
 */

export async function onRequest(context) {
    const { request } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    return new Response(
        JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            runtime: 'EdgeOne Pages Edge Functions'
        }),
        { status: 200, headers: corsHeaders }
    );
}
