"""
重试机制模块

提供网络请求的重试和退避逻辑,用于处理 Supabase API 的限流和网络抖动
"""
import time
import logging
from typing import Callable, Any, List

logger = logging.getLogger(__name__)


def is_retryable_error(e: Exception) -> bool:
    """判断是否为可重试的错误(网络/限流相关)
    
    Args:
        e: 异常对象
        
    Returns:
        True 如果错误可重试
    """
    retryable_codes = ["502", "503", "504", "Bad Gateway", "timeout", "Connection"]
    return any(code in str(e) for code in retryable_codes)


def execute_with_retry(
    fn: Callable[[], Any], 
    retries: int = 3, 
    description: str = ""
) -> Any:
    """带重试和退避的执行函数
    
    Args:
        fn: 要执行的函数
        retries: 最大重试次数
        description: 操作描述(用于日志)
        
    Returns:
        函数执行结果
        
    Raises:
        Exception: 重试耗尽后抛出最后一次异常
    """
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            if attempt == retries - 1 or not is_retryable_error(e):
                logger.error(f"执行失败 ({description}): {e}")
                raise
            wait_time = 1.5 * (attempt + 1)
            logger.warning(f"重试 {attempt + 1}/{retries} ({description}), 等待 {wait_time}s: {e}")
            time.sleep(wait_time)


def chunks(lst: List, size: int = 100) -> List[List]:
    """将列表分批,每批最多 size 个元素
    
    Args:
        lst: 要分批的列表
        size: 每批大小
        
    Returns:
        分批后的列表
    """
    return [lst[i:i + size] for i in range(0, len(lst), size)]
