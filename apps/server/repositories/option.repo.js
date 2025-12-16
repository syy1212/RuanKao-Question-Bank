/**
 * 选项 Repository
 * 负责 question_options 表的 CRUD 操作
 */
const { supabase } = require('../supabase/client');

/**
 * 批量插入或更新选项
 */
async function upsertBatch(options, batchSize = 100) {
    for (let i = 0; i < options.length; i += batchSize) {
        const batch = options.slice(i, i + batchSize);
        const { error } = await supabase
            .from('question_options')
            .upsert(batch, { onConflict: 'question_id,label' });

        if (error) {
            console.warn('⚠️ 选项插入警告:', error.message);
        }
    }
    return options.length;
}

module.exports = { upsertBatch };
