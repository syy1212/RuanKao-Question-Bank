/**
 * 题目路由
 */
const express = require('express');
const { getQuestions } = require('../controllers/questions.controller');

const router = express.Router();

router.get('/', getQuestions);

module.exports = router;
