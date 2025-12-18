/**
 * Supabase 客户端 - EdgeOne Pages 边缘函数版本
 * 使用环境变量获取配置
 */

let supabaseInstance = null;

/**
 * 获取 Supabase 客户端实例
 * @param {Object} env - EdgeOne 环境变量对象
 */
export function getSupabase(env) {
    if (supabaseInstance) return supabaseInstance;

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY 环境变量');
    }

    // 使用 fetch 直接调用 Supabase REST API
    // 边缘函数环境不支持完整的 supabase-js SDK，使用轻量级封装
    supabaseInstance = {
        url: supabaseUrl,
        key: supabaseKey,

        async query(table, options = {}) {
            const { select = '*', filters = [], order, single = false, count = false, head = false } = options;

            let url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`;

            for (const filter of filters) {
                url += `&${filter.column}=${filter.op}.${encodeURIComponent(filter.value)}`;
            }

            if (order) {
                url += `&order=${order.column}.${order.ascending ? 'asc' : 'desc'}`;
            }

            const headers = {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            };

            if (count) {
                headers['Prefer'] = 'count=exact';
            }
            if (head) {
                headers['Prefer'] = 'count=exact';
            }

            const response = await fetch(url, {
                method: head ? 'HEAD' : 'GET',
                headers
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Supabase 查询失败: ${error}`);
            }

            if (head) {
                const contentRange = response.headers.get('content-range');
                const total = contentRange ? parseInt(contentRange.split('/')[1]) : 0;
                return { count: total };
            }

            const data = await response.json();
            return single ? data[0] : data;
        }
    };

    return supabaseInstance;
}

/**
 * 重置实例（用于测试）
 */
export function resetSupabase() {
    supabaseInstance = null;
}
