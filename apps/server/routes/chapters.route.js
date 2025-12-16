/**
 * 章节路由
 */
const express = require('express');
const { getChapters } = require('../controllers/chapters.controller');

const router = express.Router();

router.get('/', getChapters);

module.exports = router;
