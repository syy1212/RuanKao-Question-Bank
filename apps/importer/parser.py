"""
Markdown 解析模块

负责将 Markdown 文件解析为 Python 字典结构
"""
import re
import logging
from pathlib import Path
from typing import Dict, List, Optional

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# 预编译正则表达式以提升性能
# 收紧题号识别规则: 只匹配严格的 "数字." 格式 (如 1. 23. 105.)
# 不匹配: (1) （1） ① 3) 3、 等格式,避免把解析内容中的序号误识别为题号
QUESTION_SPLIT_PATTERN = re.compile(r"\n(?=^(\d{1,3})\.\s*[^\d])", re.MULTILINE)
OPTION_PREFIX_PATTERN = re.compile(r"^[A-H][\.\s]")
OPTION_PARSE_PATTERN = re.compile(r"^([A-H])[\.\s]\s*(.+)")
ANSWER_PREFIX_PATTERN = re.compile(r"^[^:：】]+[:：】]\s*")
IMAGE_PATTERN = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def load_md(path: Path) -> str:
    """加载 Markdown 文件
    
    Args:
        path: Markdown 文件路径
        
    Returns:
        文件内容字符串
        
    Raises:
        FileNotFoundError: 文件不存在
    """
    if not path.exists():
        raise FileNotFoundError(f"找不到文件: {path}")
    logger.info(f"正在加载文件: {path}")
    return path.read_text(encoding="utf-8")


def split_questions(md_text: str) -> List[tuple]:
    """分割题目块,兼容 1. / 1、 / 1) 等编号形式
    
    Args:
        md_text: Markdown 文本内容
        
    Returns:
        (题号字符串, 题目内容) 元组列表
    """
    parts = QUESTION_SPLIT_PATTERN.split("\n" + md_text)
    nums = parts[1::2]
    bodies = parts[2::2]
    logger.info(f"共分割出 {len(nums)} 道题目")
    return list(zip(nums, bodies))


def parse_question_block(num_str: str, body: str) -> Dict:
    """解析单个题目块
    
    Args:
        num_str: 题号字符串
        body: 题目内容
        
    Returns:
        包含题目信息的字典
    """
    number = int(num_str)
    lines = [l.strip() for l in body.strip().splitlines() if l.strip()]
    opts: Dict[str, str] = {}
    stem_lines: List[str] = []
    ans = ""
    exp_lines: List[str] = []
    mode = "stem"
    
    for line in lines:
        # 检测选项开始
        if OPTION_PREFIX_PATTERN.match(line):
            mode = "opt"
        # 检测答案开始
        if line.startswith("答案") or line.startswith("【答案】"):
            mode = "ans"
            ans = ANSWER_PREFIX_PATTERN.sub("", line)
            continue
        # 检测解析开始
        if line.startswith("解析") or line.startswith("【解析】"):
            mode = "exp"
            # 如果解析内容和标签在同一行,提取解析内容
            explanation_text = ANSWER_PREFIX_PATTERN.sub("", line).strip()
            if explanation_text:
                exp_lines.append(explanation_text)
            continue

        if mode == "stem":
            stem_lines.append(line)
        elif mode == "opt":
            m = OPTION_PARSE_PATTERN.match(line)
            if m:
                opts[m.group(1)] = m.group(2).strip()
            else:
                # 选项可能换行续写
                if opts:
                    last = sorted(opts.keys())[-1]
                    opts[last] += " " + line
        elif mode == "ans":
            if line:
                ans += " " + line
        elif mode == "exp":
            exp_lines.append(line)

    stem = " ".join(stem_lines)
    explanation = "\n".join(exp_lines)
    
    return {
        "number": number,
        "question": stem,
        "options": opts,
        "answer": ans.strip(),
        "explanation": explanation.strip(),
    }


def extract_images(text: str, source_field: str) -> List[Dict]:
    """提取文本中的图片
    
    Args:
        text: 文本内容
        source_field: 来源字段名
        
    Returns:
        图片信息列表
    """
    imgs = []
    for i, m in enumerate(IMAGE_PATTERN.finditer(text or "")):
        alt, src = m.group(1), m.group(2)
        imgs.append({
            "order": i + 1,
            "alt": alt,
            "src": src,
            "type": "external",
            "source_field": source_field,
        })
    return imgs


def extract_tables(text: str, source_field: str) -> List[Dict]:
    """提取文本中的表格(支持 HTML 和 Markdown 格式)
    
    Args:
        text: 文本内容
        source_field: 来源字段名
        
    Returns:
        表格信息列表
    """
    tables = []
    
    # 提取 HTML 表格
    if "<table" in (text or "").lower():
        soup = BeautifulSoup(text, "html.parser")
        for idx, tbl in enumerate(soup.find_all("table")):
            rows = []
            for r in tbl.find_all("tr"):
                cells = [c.get_text(strip=True) for c in r.find_all(["th", "td"])]
                rows.append(cells)
            headers: List[str] = []
            data_rows = rows
            if rows:
                headers = rows[0]
                data_rows = rows[1:]
            tables.append({
                "order": len(tables) + 1,
                "caption": None,
                "headers": headers,
                "rows": data_rows,
                "source_field": source_field,
                "format": "html",
            })
    
    # 提取 Markdown 表格
    lines = (text or "").splitlines()
    i = 0
    while i < len(lines) - 1:
        if "|" in lines[i] and set(lines[i + 1].strip()) <= set("|:- "):
            headers = [c.strip() for c in lines[i].split("|") if c.strip()]
            i += 2
            data = []
            while i < len(lines) and "|" in lines[i]:
                data.append([c.strip() for c in lines[i].split("|") if c.strip()])
                i += 1
            tables.append({
                "order": len(tables) + 1,
                "caption": None,
                "headers": headers,
                "rows": data,
                "source_field": source_field,
                "format": "md",
            })
            continue
        i += 1
    
    return tables


def build_rich_content(q: Dict) -> Optional[Dict]:
    """构建富文本内容(图片和表格)
    
    Args:
        q: 题目字典
        
    Returns:
        富文本内容字典,无内容则返回 None
    """
    rich = {"images": [], "tables": []}
    for field in ("question", "answer", "explanation"):
        text = q.get(field, "") or ""
        rich["images"].extend(extract_images(text, field))
        rich["tables"].extend(extract_tables(text, field))
    
    # 移除空字段
    if not rich["images"]:
        rich.pop("images")
    if not rich["tables"]:
        rich.pop("tables")
    
    return rich if rich else None
