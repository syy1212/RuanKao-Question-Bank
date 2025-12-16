/**
 * 章节 Repository
 * 负责 chapters 表的 CRUD 操作
 */
const { supabase } = require('../supabase/client');

/**
 * 获取所有章节
 */
async function findAll() {
    const { data, error } = await supabase
        .from('chapters')
        .select('id, code, title, source_file')
        .order('code', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
}

/**
 * 根据 code 获取章节
 */
async function findByCode(code) {
    const { data, error } = await supabase
        .from('chapters')
        .select('id, code, title')
        .eq('code', code)
        .single();

    if (error) return null;
    return data;
}

/**
 * 插入或更新章节
 */
async function upsert(chapter) {
    const { data, error } = await supabase
        .from('chapters')
        .upsert({
            code: chapter.code,
            title: chapter.title,
            source_file: chapter.source_file
        }, { onConflict: 'code' })
        .select('id')
        .single();

    if (error) throw new Error(`章节入库失败: ${error.message}`);
    return data;
}

module.exports = { findAll, findByCode, upsert };
