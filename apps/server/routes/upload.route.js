/**
 * 上传路由
 */
const express = require('express');
const multer = require('multer');
const { uploadMarkdown } = require('../controllers/upload.controller');

const router = express.Router();

// 配置 multer 内存存储
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        // 修复中文文件名编码问题（latin1 -> utf8）
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

        if (file.originalname.endsWith('.md')) {
            cb(null, true);
        } else {
            cb(new Error('只支持 .md 文件'));
        }
    }
});

router.post('/markdown', upload.single('file'), uploadMarkdown);

module.exports = router;
