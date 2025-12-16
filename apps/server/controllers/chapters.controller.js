/**
 * 章节 Controller
 */
const questionService = require('../services/question.service');

/**
 * GET /api/chapters
 */
async function getChapters(req, res) {
    try {
        const chapters = await questionService.getChaptersWithCount();
        res.json(chapters);
    } catch (error) {
        console.error('获取章节失败:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { getChapters };
