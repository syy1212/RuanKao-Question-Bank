/**
 * Markdown 解析服务
 * 将 Markdown 内容解析为结构化的题目数据
 */
const { PATTERNS, cleanText, removeMarkdownImages, validateAnswer, extractImages } = require('../utils/text');

// ========== 正则表达式 ==========
// 题目分隔：行首数字+点（支持 "1." 或 "1. "）
const QUESTION_SPLIT = /\n(?=^\d{1,3}\.\s*\S)/gm;

/**
 * 从文件名提取章节信息
 */
function extractChapterInfo(filename) {
    const match = filename.match(/第(\d{2})章[-.·\s]*(.*?)\.md$/i);
    if (match) {
        return {
            code: `ch${match[1]}`,
            title: `第${match[1]}章-${match[2].trim()}`
        };
    }
    const baseName = filename.replace(/\.md$/i, '');
    return {
        code: baseName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        title: baseName
    };
}

/**
 * 解析单个题目块
 */
function parseQuestionBlock(number, content) {
    // 提取题目文本（答案前的部分，去除选项）
    let questionText = content.split(/【答案】/)[0] || '';
    const optionStart = questionText.search(PATTERNS.OPTION_START);
    if (optionStart > 0) {
        questionText = questionText.substring(0, optionStart);
    }

    // 提取题目中的图片 URL（在清洗前）
    const questionImages = extractImages(questionText);
    questionText = cleanText(questionText);

    // 提取选项（使用统一的正则）
    const options = {};
    const optionImages = {};
    const optionText = content.split(/【答案】/)[0] || '';
    const optRegex = new RegExp(PATTERNS.OPTION_EXTRACT.source, 'gm');
    let match;
    while ((match = optRegex.exec(optionText)) !== null) {
        const rawOptContent = match[2].trim();
        // 提取选项中的图片
        const optImgs = extractImages(rawOptContent);
        if (optImgs.length > 0) {
            optionImages[match[1]] = optImgs;
        }
        const optContent = removeMarkdownImages(rawOptContent);
        if (optContent) {
            options[match[1]] = optContent;
        }
    }

    // 提取并校验答案
    const answerMatch = content.match(PATTERNS.ANSWER);
    const rawAnswer = answerMatch ? answerMatch[1].trim() : '';
    const { valid, cleaned: answer, error: answerError } = validateAnswer(rawAnswer, options);

    // 提取解析
    const explMatch = content.match(PATTERNS.EXPLANATION);
    const rawExplanation = explMatch ? explMatch[1].trim() : '';
    const explanationImages = extractImages(rawExplanation);
    const explanation = removeMarkdownImages(rawExplanation);

    // 构建 rich_content（仅当有图片时）
    const rich_content = {};
    if (questionImages.length > 0) {
        rich_content.question_images = questionImages;
    }
    if (Object.keys(optionImages).length > 0) {
        rich_content.option_images = optionImages;
    }
    if (explanationImages.length > 0) {
        rich_content.explanation_images = explanationImages;
    }

    return {
        number: parseInt(number),
        question_text: questionText,
        options,
        answer,
        explanation,
        rich_content: Object.keys(rich_content).length > 0 ? rich_content : null,
        _validation: {
            answerValid: valid,
            answerError: answerError || null,
            optionCount: Object.keys(options).length
        }
    };
}


/**
 * 解析 Markdown 内容
 * @returns {{ chapter, questions, stats }}
 */
function parseMarkdown(content, filename) {
    const chapter = extractChapterInfo(filename);
    const blocks = content.split(QUESTION_SPLIT);

    const questions = [];
    const duplicates = {};
    const seenNumbers = new Set();
    let invalidAnswers = 0;
    let skippedQuestions = 0;

    for (const block of blocks) {
        if (!block.trim()) continue;
        const numMatch = block.match(/^(\d{1,3})\./);
        if (!numMatch) continue;

        const number = parseInt(numMatch[1]);
        const question = parseQuestionBlock(number, block);

        // 统计重复
        if (seenNumbers.has(number)) {
            duplicates[number] = (duplicates[number] || 1) + 1;
        }
        seenNumbers.add(number);

        // 统计无效答案
        if (!question._validation.answerValid) {
            invalidAnswers++;
        }

        // 有效性检查：必须有题目文本和至少2个选项
        if (question.question_text && question._validation.optionCount >= 2) {
            // 移除内部验证字段
            delete question._validation;
            questions.push(question);
        } else {
            skippedQuestions++;
        }
    }

    // 去重（保留最后一个）
    const uniqueQuestions = [];
    const seen = new Set();
    for (let i = questions.length - 1; i >= 0; i--) {
        if (!seen.has(questions[i].number)) {
            seen.add(questions[i].number);
            uniqueQuestions.unshift(questions[i]);
        }
    }

    return {
        chapter,
        questions: uniqueQuestions,
        stats: {
            blocksFound: blocks.length,
            parsed: questions.length,
            unique: uniqueQuestions.length,
            duplicateCount: Object.keys(duplicates).length,
            duplicates,
            invalidAnswers,
            skipped: skippedQuestions
        }
    };
}

module.exports = { parseMarkdown, extractChapterInfo };
