"""
importer 包初始化

题库导入工具的模块化实现
"""
from .retry import is_retryable_error, execute_with_retry, chunks
from .parser import load_md, split_questions, parse_question_block, build_rich_content
from .normalizer import normalize_questions, export_to_json, load_from_json
from .supabase import (
    get_supabase_client, 
    upsert_chapter, 
    batch_upsert_questions, 
    batch_upsert_options
)
from .cli import (
    import_chapter, 
    import_from_json_file, 
    scan_markdown_files,
    scan_json_files,
    WorkMode
)

__all__ = [
    # retry
    "is_retryable_error",
    "execute_with_retry", 
    "chunks",
    # parser
    "load_md",
    "split_questions",
    "parse_question_block",
    "build_rich_content",
    # normalizer
    "normalize_questions",
    "export_to_json",
    "load_from_json",
    # supabase
    "get_supabase_client",
    "upsert_chapter",
    "batch_upsert_questions",
    "batch_upsert_options",
    # importer
    "import_chapter",
    "import_from_json_file",
    "scan_markdown_files",
    "scan_json_files",
    "WorkMode",
]

