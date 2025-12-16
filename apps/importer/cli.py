#!/usr/bin/env python3
"""
题库导入工具 - CLI 入口

⚠️ 该目录仅用于离线导入，不参与线上服务

支持 4 种工作模式:
1. MD → JSON (仅转换)
2. JSON → DB (从 JSON 导入)
3. MD → JSON → DB (完整流程)
4. MD → DB (直接导入,最快)

Usage:
    python -m importer.cli
    或
    python apps/importer/cli.py
"""
import logging
import re
from enum import IntEnum
from pathlib import Path
from typing import Dict, List, Optional, Union

from .parser import load_md, split_questions, parse_question_block
from .normalizer import normalize_questions, export_to_json, load_from_json
from .supabase import get_supabase_client, upsert_chapter, batch_upsert_questions, batch_upsert_options

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


# ============================================================
# 工作模式枚举
# ============================================================

class WorkMode(IntEnum):
    """工作模式枚举"""
    MD_TO_JSON = 1
    JSON_TO_DB = 2
    FULL_PROCESS = 3
    MD_TO_DB = 4


# ============================================================
# 辅助函数
# ============================================================

def _repo_root() -> Path:
    """推导仓库根目录（KaiFA）"""
    return Path(__file__).resolve().parents[2]


def _extract_chapter_from_filename(stem: str) -> Optional[Dict[str, str]]:
    """从文件名提取章节信息（第03章-xxx）"""
    match = re.match(r"第(\d+)章[-_·\s]*(.+)", stem)
    if not match:
        return None
    chapter_num = match.group(1).zfill(2)
    return {
        "code": f"ch{chapter_num}",
        "title": stem,
    }


def _dedup_questions_by_number(questions: List[Dict]) -> List[Dict]:
    """按 number 去重（保留最后一次出现），避免同批次 upsert 触发冲突"""
    if not questions:
        return []

    counts: Dict[int, int] = {}
    for q in questions:
        n = int(q.get("number", 0))
        counts[n] = counts.get(n, 0) + 1

    dupes = {n: c for n, c in counts.items() if c > 1}
    if dupes:
        logger.warning("⚠️ 发现重复题号，将以最后一次为准: %s", dupes)

    seen = set()
    unique_rev: List[Dict] = []
    for q in reversed(questions):
        n = int(q.get("number", 0))
        if n in seen:
            continue
        seen.add(n)
        unique_rev.append(q)

    return list(reversed(unique_rev))


def _parse_markdown_file(md_path: Path) -> List[Dict]:
    """解析 Markdown 为标准化题目列表"""
    md_text = load_md(md_path)
    blocks = split_questions(md_text)
    questions_raw = [parse_question_block(num, body) for num, body in blocks]
    questions = normalize_questions(questions_raw)
    return _dedup_questions_by_number(questions)


# ============================================================
# 文件扫描
# ============================================================

def scan_markdown_files(base_dir: Optional[Path] = None) -> List[Dict[str, str]]:
    """扫描章节 Markdown 文件"""
    if base_dir is not None:
        search_dir = Path(base_dir)
    else:
        cwd = Path.cwd()
        if list(cwd.glob("第*章*.md")):
            search_dir = cwd
        else:
            search_dir = _repo_root() / "md"

    if not search_dir.exists():
        return []

    md_files = sorted(search_dir.glob("第*章*.md"))
    chapters: List[Dict[str, str]] = []

    for md_file in md_files:
        info = _extract_chapter_from_filename(md_file.stem)
        if not info:
            continue
        info.update({
            "file": str(md_file),
            "display": f"{info['code']} - {md_file.stem}",
        })
        chapters.append(info)

    return chapters


def scan_json_files(base_dir: Optional[Path] = None) -> List[Dict[str, str]]:
    """扫描 JSON 导出文件（默认 json_exports/）"""
    if base_dir is not None:
        search_dir = Path(base_dir)
    else:
        cwd = Path.cwd() / "json_exports"
        if cwd.exists():
            search_dir = cwd
        else:
            search_dir = _repo_root() / "json_exports"

    if not search_dir.exists():
        return []

    json_files = sorted(search_dir.glob("*.json"))
    results: List[Dict[str, str]] = []

    for json_file in json_files:
        info = _extract_chapter_from_filename(json_file.stem)
        if not info:
            results.append({"title": json_file.stem, "file": str(json_file)})
            continue
        info.update({
            "file": str(json_file),
            "display": f"{info['code']} - {json_file.stem}",
        })
        results.append(info)

    return results


# ============================================================
# 导入函数
# ============================================================

def import_chapter(
    chapter: Dict[str, str],
    client=None,
    json_output_dir: Optional[Path] = None,
    mode: WorkMode = WorkMode.FULL_PROCESS,
) -> Dict:
    """导入单个章节"""
    md_path = Path(chapter["file"]).resolve()
    questions = _parse_markdown_file(md_path)

    if not questions:
        raise ValueError(f"未解析到有效题目: {md_path}")

    chapter_code = chapter.get("code")
    chapter_title = chapter.get("title")

    if not chapter_code or not chapter_title:
        derived = _extract_chapter_from_filename(md_path.stem)
        chapter_code = chapter_code or (derived or {}).get("code")
        chapter_title = chapter_title or (derived or {}).get("title")

    if not chapter_code or not chapter_title:
        raise ValueError(f"无法从文件名推导章节信息: {md_path.name}")

    result: Dict = {
        "code": chapter_code,
        "title": chapter_title,
        "file": str(md_path),
        "total_questions": len(questions),
    }

    need_json = mode in (WorkMode.MD_TO_JSON, WorkMode.FULL_PROCESS)
    need_db = mode in (WorkMode.MD_TO_DB, WorkMode.FULL_PROCESS)

    if need_json:
        out_dir = Path(json_output_dir) if json_output_dir else (Path.cwd() / "json_exports")
        json_path = export_to_json(
            {"code": chapter_code, "title": chapter_title, "file": md_path.name},
            questions,
            out_dir,
        )
        result["json_file"] = str(json_path)
        logger.info(f"✅ JSON 已保存: {json_path}")

    if need_db:
        supa = client or get_supabase_client()
        chapter_id = upsert_chapter(supa, chapter_code, chapter_title, md_path.name)
        question_id_map = batch_upsert_questions(supa, chapter_id, questions)
        option_count = batch_upsert_options(supa, questions, question_id_map)

        result.update({
            "chapter_id": chapter_id,
            "upserted_questions": len(question_id_map),
            "upserted_options": option_count,
        })
        logger.info(f"✅ 已入库: {chapter_code} - {len(question_id_map)} 题, {option_count} 选项")

    return result


def import_from_json_file(json_file: Path, client=None) -> Dict:
    """从 JSON 文件导入到数据库"""
    json_file = Path(json_file).resolve()
    data = load_from_json(json_file)

    chapter = data.get("chapter", {})
    questions = _dedup_questions_by_number(data.get("questions", []) or [])

    if not questions:
        raise ValueError(f"JSON 中无题目: {json_file}")

    supa = client or get_supabase_client()
    chapter_id = upsert_chapter(
        supa,
        chapter.get("code"),
        chapter.get("title"),
        chapter.get("source_file", json_file.name),
    )
    question_id_map = batch_upsert_questions(supa, chapter_id, questions)
    option_count = batch_upsert_options(supa, questions, question_id_map)

    logger.info(f"✅ 从 JSON 导入: {chapter.get('code')} - {len(question_id_map)} 题")

    return {
        "code": chapter.get("code"),
        "title": chapter.get("title"),
        "chapter_id": chapter_id,
        "upserted_questions": len(question_id_map),
        "upserted_options": option_count,
        "json_file": str(json_file),
    }


# ============================================================
# CLI 交互函数
# ============================================================

def select_work_mode() -> Optional[WorkMode]:
    """选择工作模式"""
    print("\n" + "=" * 60)
    print("请选择工作模式:")
    print("=" * 60)
    print("  1. 仅转换 MD → JSON (不上传到数据库)")
    print("  2. 从 JSON 导入到数据库")
    print("  3. 完整流程 (MD → JSON → 数据库)")
    print("  4. 直接导入 MD → 数据库 (不生成 JSON)")
    print("=" * 60)
    
    while True:
        try:
            choice = input("\n请选择模式 [1-4]: ").strip()
            choice_num = int(choice)
            
            if choice_num == 1:
                return WorkMode.MD_TO_JSON
            elif choice_num == 2:
                return WorkMode.JSON_TO_DB
            elif choice_num == 3:
                return WorkMode.FULL_PROCESS
            elif choice_num == 4:
                return WorkMode.MD_TO_DB
            else:
                print(f"❌ 无效选择,请输入 1-4 之间的数字")
        except ValueError:
            print("❌ 请输入有效的数字")
        except KeyboardInterrupt:
            print("\n\n❌ 用户取消操作")
            return None


def select_item_interactive(
    items: List[Dict], 
    item_type: str = "章节"
) -> Optional[Union[Dict, str]]:
    """交互式选择项目"""
    if not items:
        logger.error(f"未找到任何{item_type}")
        return None
    
    print(f"\n{'='*60}")
    print(f"发现以下{item_type}文件:")
    print("=" * 60)
    
    for idx, item in enumerate(items, 1):
        if "code" in item:
            print(f"  {idx}. {item['code']} - {item['title']}")
        else:
            print(f"  {idx}. {item['title']}")
    
    print(f"  0. 处理所有{item_type}")
    print("=" * 60)
    
    while True:
        try:
            choice = input(f"\n请选择要处理的{item_type} (输入编号): ").strip()
            choice_num = int(choice)
            
            if choice_num == 0:
                return "all"
            elif 1 <= choice_num <= len(items):
                return items[choice_num - 1]
            else:
                print(f"❌ 无效选择,请输入 0-{len(items)} 之间的数字")
        except ValueError:
            print("❌ 请输入有效的数字")
        except KeyboardInterrupt:
            print("\n\n❌ 用户取消操作")
            return None


# ============================================================
# 主函数
# ============================================================

def main() -> None:
    """主函数"""
    try:
        json_output_dir = Path.cwd() / "json_exports"
        
        mode = select_work_mode()
        if mode is None:
            logger.info("未选择工作模式,退出")
            return
        
        logger.info(f"\n当前工作模式: {mode.name}\n")
        
        # 模式 1: MD → JSON
        if mode == WorkMode.MD_TO_JSON:
            chapters = scan_markdown_files()
            selected = select_item_interactive(chapters, "章节")
            if selected is None:
                return
            
            if selected == "all":
                for chapter in chapters:
                    import_chapter(chapter, json_output_dir=json_output_dir, mode=mode)
            else:
                import_chapter(selected, json_output_dir=json_output_dir, mode=mode)
        
        # 模式 2: JSON → 数据库
        elif mode == WorkMode.JSON_TO_DB:
            json_files = scan_json_files()
            selected = select_item_interactive(json_files, "JSON 文件")
            if selected is None:
                return
            
            client = get_supabase_client()
            if selected == "all":
                for file_info in json_files:
                    import_from_json_file(Path(file_info["file"]), client)
            else:
                import_from_json_file(Path(selected["file"]), client)
        
        # 模式 3: 完整流程 (MD → JSON → DB)
        elif mode == WorkMode.FULL_PROCESS:
            chapters = scan_markdown_files()
            selected = select_item_interactive(chapters, "章节")
            if selected is None:
                return
            
            client = get_supabase_client()
            if selected == "all":
                for chapter in chapters:
                    import_chapter(chapter, client=client, json_output_dir=json_output_dir, mode=mode)
            else:
                import_chapter(selected, client=client, json_output_dir=json_output_dir, mode=mode)
        
        # 模式 4: MD → DB (直接导入)
        elif mode == WorkMode.MD_TO_DB:
            chapters = scan_markdown_files()
            selected = select_item_interactive(chapters, "章节")
            if selected is None:
                return
            
            client = get_supabase_client()
            if selected == "all":
                logger.info(f"\n开始导入所有 {len(chapters)} 个章节 (幂等模式)...\n")
                for chapter in chapters:
                    import_chapter(chapter, client=client, mode=mode)
                logger.info(f"\n🎉 所有章节导入完成! 共 {len(chapters)} 个章节")
            else:
                import_chapter(selected, client=client, mode=mode)
    
    except KeyboardInterrupt:
        logger.info("\n\n❌ 用户取消操作")
    except Exception as e:
        logger.error(f"❌ 操作失败: {e}")
        raise


# ============================================================
# 导出
# ============================================================

__all__ = [
    "WorkMode",
    "scan_markdown_files",
    "scan_json_files",
    "import_chapter",
    "import_from_json_file",
]


if __name__ == "__main__":
    main()
