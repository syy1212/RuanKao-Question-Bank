"""
数据标准化模块

负责将解析后的数据转换为标准 JSON 格式
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from .parser import build_rich_content

logger = logging.getLogger(__name__)

# 解析器版本号,用于追踪数据格式变更
PARSER_VERSION = "1.0"


def normalize_questions(questions: List[Dict]) -> List[Dict]:
    """标准化题目数据,添加富文本内容
    
    Args:
        questions: 原始题目列表
        
    Returns:
        标准化后的题目列表
    """
    normalized = []
    for q in questions:
        rich = build_rich_content(q)
        question_data = {
            "number": q["number"],
            "question": q["question"],
            "options": q["options"],
            "answer": q["answer"],
            "explanation": q.get("explanation", ""),
        }
        if rich:
            question_data["rich_content"] = rich
        normalized.append(question_data)
    return normalized


def export_to_json(
    chapter_info: Dict[str, str], 
    questions: List[Dict], 
    output_dir: Path
) -> Path:
    """将解析后的章节数据导出为 JSON 文件
    
    Args:
        chapter_info: 章节信息 (code, title, file)
        questions: 题目列表
        output_dir: 输出目录
        
    Returns:
        生成的 JSON 文件路径
    """
    # 确保输出目录存在
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 标准化题目数据
    questions_normalized = normalize_questions(questions)
    
    # 构建完整的 JSON 数据结构
    data = {
        "chapter": {
            "code": chapter_info["code"],
            "title": chapter_info["title"],
            "source_file": chapter_info["file"],
        },
        "questions": questions_normalized,
        "metadata": {
            "exported_at": datetime.now().isoformat(),
            "total_questions": len(questions),
            "parser_version": PARSER_VERSION,
            "source": "markdown",
        }
    }
    
    # 生成输出文件名
    output_file = output_dir / f"{chapter_info['title']}.json"
    
    # 保存为 JSON 文件
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"JSON 文件已保存: {output_file}")
    return output_file


def load_from_json(json_file: Path) -> Dict:
    """从 JSON 文件加载章节数据
    
    Args:
        json_file: JSON 文件路径
        
    Returns:
        加载的数据字典
        
    Raises:
        FileNotFoundError: 文件不存在
        ValueError: 数据格式不正确
    """
    if not json_file.exists():
        raise FileNotFoundError(f"JSON 文件不存在: {json_file}")
    
    logger.info(f"正在加载 JSON 文件: {json_file}")
    with json_file.open("r", encoding="utf-8") as f:
        data = json.load(f)
    
    # 验证数据结构
    required_keys = ["chapter", "questions"]
    for key in required_keys:
        if key not in data:
            raise ValueError(f"JSON 文件缺少必需字段: {key}")
    
    logger.info(f"加载成功,包含 {len(data['questions'])} 道题目")
    return data
