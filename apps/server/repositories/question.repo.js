/**
 * 题目 Repository
 * 负责 questions 表的 CRUD 操作
 */
const { supabase } = require('../supabase/client');

/**
 * 获取章节的题目数量
 */
async function countByChapterId(chapterId) {
    const { count, error } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('chapter_id', chapterId);

    if (error) return 0;
    return count || 0;
}

/**
 * 获取章节的所有题目（含选项）
 */
async function findByChapterId(chapterId) {
    const { data, error } = await supabase
        .from('questions')
        .select(`
            id,
            number,
            question_text,
            answer,
            explanation,
            rich_content,
            question_options(label, content)
        `)
        .eq('chapter_id', chapterId)
        .order('number', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
}

/**
 * 批量插入或更新题目
 */
async function upsertBatch(questions, batchSize = 50) {
    let importedCount = 0;

    for (let i = 0; i < questions.length; i += batchSize) {
        const batch = questions.slice(i, i + batchSize);
        const { error } = await supabase
            .from('questions')
            .upsert(batch, { onConflict: 'chapter_id,number' });

        if (error) throw new Error(`题目入库失败: ${error.message}`);
        importedCount += batch.length;
    }

    return importedCount;
}

/**
 * 获取章节的题目 ID 映射
 */
async function getIdMapByChapterId(chapterId) {
    const { data } = await supabase
        .from('questions')
        .select('id, number')
        .eq('chapter_id', chapterId);

    const map = {};
    (data || []).forEach(q => { map[q.number] = q.id; });
    return map;
}

module.exports = { countByChapterId, findByChapterId, upsertBatch, getIdMapByChapterId };
