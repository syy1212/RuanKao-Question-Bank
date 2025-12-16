"""
Supabase 数据库操作模块

封装所有数据库操作,提供批量 upsert 功能
"""
import os
import logging
from typing import Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from .retry import execute_with_retry, chunks

logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()


def require_env(name: str) -> str:
    """获取必需的环境变量"""
    val = os.environ.get(name, "").strip()
    if not val:
        raise RuntimeError(f"缺少必需环境变量: {name}")
    return val


def get_supabase_client() -> Client:
    """获取 Supabase 客户端
    
    Returns:
        已初始化的 Supabase 客户端
    """
    supabase_url = require_env("SUPABASE_URL")
    supabase_key = require_env("SUPABASE_SERVICE_KEY")
    return create_client(supabase_url, supabase_key)


def upsert_chapter(client: Client, code: str, title: str, source_file: str) -> str:
    """插入或更新章节信息
    
    Args:
        client: Supabase 客户端
        code: 章节代码
        title: 章节标题
        source_file: 来源文件
        
    Returns:
        章节 ID
    """
    logger.info(f"正在 upsert 章节: {code} - {title}")
    
    def do_upsert():
        return client.table("chapters") \
            .upsert(
                {"code": code, "title": title, "source_file": source_file},
                on_conflict="code"
            ) \
            .execute()
    
    resp = execute_with_retry(do_upsert, description=f"upsert 章节 {code}")
    chapter_id = resp.data[0]["id"]
    logger.info(f"章节 ID: {chapter_id}")
    return chapter_id


def batch_upsert_questions(
    client: Client, 
    chapter_id: str, 
    questions: List[Dict],
    batch_size: int = 50
) -> Dict[int, int]:
    """批量 upsert 题目
    
    Args:
        client: Supabase 客户端
        chapter_id: 章节 ID
        questions: 题目列表
        batch_size: 每批大小
        
    Returns:
        题号到题目 ID 的映射
    """
    logger.info(f"批量导入 {len(questions)} 道题目...")
    
    # 构建 payload
    questions_payload = []
    for q in questions:
        questions_payload.append({
            "chapter_id": chapter_id,
            "number": q["number"],
            "question_text": q.get("question", q.get("question_text", "")),
            "answer": q["answer"],
            "explanation": q.get("explanation", ""),
            "rich_content": q.get("rich_content", {}),
        })
    
    # 分批 upsert
    question_id_map = {}
    for batch_idx, batch in enumerate(chunks(questions_payload, batch_size)):
        def do_upsert():
            return client.table("questions") \
                .upsert(batch, on_conflict="chapter_id,number") \
                .execute()
        
        resp = execute_with_retry(
            do_upsert, 
            description=f"upsert 题目批次 {batch_idx + 1}"
        )
        
        for row in resp.data:
            question_id_map[row["number"]] = row["id"]
        
        logger.info(f"✅ 题目批次 {batch_idx + 1} 完成 ({len(batch)} 道)")
    
    logger.info(f"✅ 所有题目导入完成,共 {len(question_id_map)} 道")
    return question_id_map


def batch_upsert_options(
    client: Client,
    questions: List[Dict],
    question_id_map: Dict[int, int],
    batch_size: int = 100
) -> int:
    """批量 upsert 选项
    
    Args:
        client: Supabase 客户端
        questions: 题目列表
        question_id_map: 题号到题目 ID 的映射
        batch_size: 每批大小
        
    Returns:
        导入的选项总数
    """
    # 收集所有选项
    all_options = []
    for q in questions:
        qid = question_id_map.get(q["number"])
        if not qid:
            logger.warning(f"题目 {q['number']} 未找到 ID,跳过选项")
            continue
        for label, content in q.get("options", {}).items():
            all_options.append({
                "question_id": qid,
                "label": label,
                "content": content
            })
    
    if not all_options:
        logger.info("无选项需要导入")
        return 0
    
    # 分批 upsert
    total_batches = len(chunks(all_options, batch_size))
    logger.info(f"批量导入 {len(all_options)} 个选项 (分 {total_batches} 批)...")
    
    for batch_idx, batch in enumerate(chunks(all_options, batch_size)):
        def do_upsert():
            return client.table("question_options") \
                .upsert(batch, on_conflict="question_id,label") \
                .execute()
        
        execute_with_retry(
            do_upsert,
            description=f"upsert 选项批次 {batch_idx + 1}"
        )
        logger.info(f"✅ 选项批次 {batch_idx + 1} 完成 ({len(batch)} 个)")
    
    return len(all_options)
