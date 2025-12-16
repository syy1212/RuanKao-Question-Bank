/**
 * Supabase 客户端 - 统一入口
 * 
 * ⚠️ 整个应用只应通过此模块获取 Supabase 实例
 */
require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY 环境变量');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
