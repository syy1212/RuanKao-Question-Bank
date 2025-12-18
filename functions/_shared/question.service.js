/**
 * 题目服务 - EdgeOne Pages 边缘函数版本
 * 处理题目相关的业务逻辑
 */
import { getSupabase } from './supabase.js';
import { removeQuestionPrefix, removeMarkdownImages } from './text.js';

/**
 * 获取所有章节（含题目数量）
 */
export async function getChaptersWithCount(env) {
    const supabase = getSupabase(env);

    // 获取所有章节
    const chapters = await supabase.query('chapters', {
        select: 'id,code,title,source_file',
        order: { column: 'code', ascending: true }
    });

    // 获取每个章节的题目数量
    const result = await Promise.all(chapters.map(async (chapter) => {
        const { count } = await supabase.query('questions', {
            filters: [{ column: 'chapter_id', op: 'eq', value: chapter.id }],
            count: true,
            head: true
        });
        return {
            id: chapter.id,
            code: chapter.code,
            title: chapter.title,
            question_count: count || 0
        };
    }));

    return result;
}

/**
 * 获取章节的题目列表
 */
export async function getQuestionsByChapter(env, chapterCode) {
    const supabase = getSupabase(env);

    // 获取章节信息
    const chapters = await supabase.query('chapters', {
        select: 'id,code,title',
        filters: [{ column: 'code', op: 'eq', value: chapterCode }]
    });

    const chapter = chapters[0];
    if (!chapter) return null;

    // 获取题目（包含选项）
    const questions = await supabase.query('questions', {
        select: 'id,number,question_text,answer,explanation,rich_content,question_options(label,content)',
        filters: [{ column: 'chapter_id', op: 'eq', value: chapter.id }],
        order: { column: 'number', ascending: true }
    });

    // 格式化题目数据
    const formattedQuestions = questions.map((q, idx) => {
        let questionText = removeQuestionPrefix(q.question_text);
        questionText = removeMarkdownImages(questionText);

        return {
            id: q.id,
            order: idx + 1,
            number: q.number,
            question: questionText,
            options: Object.fromEntries(
                (q.question_options || [])
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map(opt => [opt.label, opt.content])
            ),
            answer: q.answer,
            explanation: removeMarkdownImages(q.explanation || ''),
            rich_content: q.rich_content || {}
        };
    });

    const version = `${chapter.code}@${formattedQuestions.length}@${new Date().toISOString().split('T')[0]}`;

    return {
        chapter: {
            id: chapter.id,
            code: chapter.code,
            title: chapter.title,
            question_count: formattedQuestions.length,
            version
        },
        questions: formattedQuestions
    };
}
