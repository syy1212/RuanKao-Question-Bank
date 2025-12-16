/**
 * 上传 Controller
 */
const importService = require('../services/import.service');

/**
 * POST /api/upload/markdown
 */
async function uploadMarkdown(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '未上传文件' });
        }

        const result = await importService.importMarkdown(
            req.file.buffer,
            req.file.originalname
        );

        res.json(result);
    } catch (error) {
        console.error('❌ 导入失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = { uploadMarkdown };
