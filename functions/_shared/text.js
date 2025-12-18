/**
 * 文本处理工具
 * 统一的文本清洗和格式化
 * 
 * 从 apps/server/utils/text.js 迁移，适配 ES Module
 */

// ========== 正则表达式常量 ==========
export const PATTERNS = {
    /** 题号前缀 (如 "1." "23.") */
    QUESTION_PREFIX: /^\d{1,3}\.\s*/,

    /** Markdown 图片语法 */
    MARKDOWN_IMAGE: /!\[[^\]]*\]\(([^)]+)\)/g,

    /** 选项标签开头 (如 "A." "B、") */
    OPTION_START: /^[A-F][\.、\s]/m,

    /** 提取选项 */
    OPTION_EXTRACT: /^([A-F])[\.、]\s*([\s\S]*?)(?=^[A-F][\.、]|【答案】|$)/gm,

    /** 答案标签 */
    ANSWER: /【答案】\s*([A-F]+)/,

    /** 解析标签 */
    EXPLANATION: /【解析】\s*([\s\S]*?)$/,

    /** 合法答案字符 */
    VALID_ANSWER: /^[A-F]+$/
};

// ========== 文本清洗函数 ==========

/**
 * 去除题号前缀 (如 "1." "23.")
 */
export function removeQuestionPrefix(text) {
    return (text || '').replace(PATTERNS.QUESTION_PREFIX, '');
}

/**
 * 去除 Markdown 图片语法
 */
export function removeMarkdownImages(text) {
    if (!text) return '';
    return text.replace(PATTERNS.MARKDOWN_IMAGE, '').trim();
}

/**
 * 完整清洗文本（去除题号前缀 + 图片）
 */
export function cleanText(text) {
    return removeMarkdownImages(removeQuestionPrefix(text)).trim();
}

/**
 * 校验答案合法性
 * @param {string} answer - 答案字符串
 * @param {Object} options - 选项对象
 * @returns {{ valid: boolean, cleaned: string, error?: string }}
 */
export function validateAnswer(answer, options = {}) {
    const cleaned = (answer || '').trim().toUpperCase();

    if (!cleaned) {
        return { valid: false, cleaned: '', error: '答案为空' };
    }

    if (!PATTERNS.VALID_ANSWER.test(cleaned)) {
        return { valid: false, cleaned, error: `答案格式非法: ${cleaned}` };
    }

    // 多选题：检查每个字母是否都在选项中
    const optionKeys = Object.keys(options);
    for (const char of cleaned) {
        if (optionKeys.length > 0 && !optionKeys.includes(char)) {
            return { valid: false, cleaned, error: `答案 ${char} 不在选项中` };
        }
    }

    return { valid: true, cleaned };
}

/**
 * 提取文本中的所有图片 URL
 * @returns {string[]} 图片 URL 数组
 */
export function extractImages(text) {
    if (!text) return [];
    const images = [];
    const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
            images.push(match[1].trim());
        }
    }
    return images;
}
