/**
 * 题目 Controller
 */
const questionService = require('../services/question.service');

/**
 * GET /api/questions?chapter=ch05
 */
async function getQuestions(req, res) {
    const chapterCode = req.query.chapter;

    if (!chapterCode) {
        return res.status(400).json({ error: '缺少 chapter 参数' });
    }

    try {
        const result = await questionService.getQuestionsByChapter(chapterCode);

        if (!result) {
            return res.status(404).json({ error: `未找到章节: ${chapterCode}` });
        }

        res.json(result);
    } catch (error) {
        console.error('获取题目失败:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getQuestions };
