/**
 * 题目服务
 * 处理题目相关的业务逻辑
 */
const chapterRepo = require('../repositories/chapter.repo');
const questionRepo = require('../repositories/question.repo');
const { removeQuestionPrefix, removeMarkdownImages } = require('../utils/text');

/**
 * 获取所有章节（含题目数量）
 */
async function getChaptersWithCount() {
    const chapters = await chapterRepo.findAll();

    return Promise.all(chapters.map(async (chapter) => {
        const count = await questionRepo.countByChapterId(chapter.id);
        return {
            id: chapter.id,
            code: chapter.code,
            title: chapter.title,
            question_count: count
        };
    }));
}

/**
 * 获取章节的题目列表
 */
async function getQuestionsByChapter(chapterCode) {
    const chapter = await chapterRepo.findByCode(chapterCode);
    if (!chapter) return null;

    const questions = await questionRepo.findByChapterId(chapter.id);

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

module.exports = { getChaptersWithCount, getQuestionsByChapter };
