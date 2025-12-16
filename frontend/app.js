/**
 * 软考练题系统 - 前端应用
 * 
 * 所有业务逻辑从 index.html 中抽取到此文件
 */

// ========== 全局配置 ==========
const API_BASE = '/api';

// ========== API 调用 ==========
async function fetchChapters() {
    const response = await fetch(`${API_BASE}/chapters`);
    if (!response.ok) {
        throw new Error(`获取章节失败: ${response.status}`);
    }
    return response.json();
}

async function fetchQuestionsByChapter(code) {
    const response = await fetch(`${API_BASE}/questions?chapter=${encodeURIComponent(code)}`);
    if (!response.ok) {
        throw new Error(`获取题目失败: ${response.status}`);
    }
    return response.json();
}

// ========== 状态变量 ==========
let questions = [];
let allQuestions = [];
let currentIndex = 0;
let selectedOption = null;
let answered = false;
let correctList = [];
let wrongList = [];
let answerState = {};
let chapters = [];
let currentChapter = null;
let dataSource = 'local';
let practiceMode = 'all';
let wrongPointer = 0;
let viewMode = 'quiz';
let practiceCount = 0;
let sessionCompleted = false;

const hasRemote = true; // 始终使用后端 API

// ========== 初始化 ==========
async function init() {
    try {
        await initChapters();
        await loadQuestions();
        renderQuestion();
    } catch (error) {
        showToast('初始化失败: ' + error.message, 'error');
    }
}

async function initChapters() {
    try {
        chapters = await fetchChapters();
        if (chapters.length) {
            currentChapter = chapters[0];
            dataSource = 'remote';
            renderChapterList();
        }
    } catch (e) {
        console.warn('加载章节失败', e);
        dataSource = 'local';
    }
}

function renderChapterList() {
    const list = document.getElementById('chapterList');
    list.innerHTML = chapters.map(ch => `
        <button class="chapter-item ${ch.code === currentChapter?.code ? 'active' : ''}" 
                onclick="handleChapterChange('${ch.code}')">
            ${ch.title}
        </button>
    `).join('');
}

async function handleChapterChange(code) {
    const target = chapters.find(ch => ch.code === code);
    if (!target) return;
    currentChapter = target;
    resetSessionState();
    await loadQuestions(code);
    renderChapterList();
    closeSidebar();
}

async function loadQuestions(chapterCode) {
    try {
        if (dataSource === 'remote' && chapters.length) {
            const targetCode = chapterCode || currentChapter?.code || chapters[0].code;
            const { chapter, questions: remoteQuestions } = await fetchQuestionsByChapter(targetCode);
            currentChapter = chapter;
            updatePageTitle(chapter.title);
            allQuestions = remoteQuestions;
        } else if (typeof questionsData !== 'undefined') {
            dataSource = 'local';
            updatePageTitle(questionsData.title || '本地题库');
            allQuestions = questionsData.questions || [];
        }

        if (!allQuestions.length) {
            document.getElementById('questionText').textContent = '暂无题目';
            return;
        }

        questions = allQuestions;
        practiceCount = questions.length;
        currentIndex = 0;
        updateStats();
        renderQuestion();
    } catch (error) {
        showToast('加载题目失败: ' + error.message, 'error');
    }
}

function updatePageTitle(title) {
    document.getElementById('chapterTitle').textContent = title;
    document.title = title + ' - 软考练题';
}

function resetSessionState() {
    currentIndex = 0;
    answered = false;
    selectedOption = null;
    correctList = [];
    wrongList = [];
    answerState = {};
    practiceMode = 'all';
    wrongPointer = 0;
    sessionCompleted = false;
    updateStats();
}

// ========== 辅助函数：渲染图片 ==========
function renderImages(images) {
    if (!images || images.length === 0) return '';
    return images.map(url => `<img src="${url}" class="question-image" alt="题目图片" />`).join('');
}

// ========== 渲染题目 ==========
function renderQuestion() {
    if (!questions.length) return;

    const question = questions[currentIndex];
    const rich = question.rich_content || {};

    // 显示题号
    const questionNumber = question.number || (currentIndex + 1);
    document.getElementById('questionMeta').textContent = `第 ${questionNumber} 题`;

    // 渲染题目文本 + 图片
    let questionHtml = `<div class="question-text-content">${question.question}</div>`;
    if (rich.question_images && rich.question_images.length > 0) {
        questionHtml += `<div class="question-images">${renderImages(rich.question_images)}</div>`;
    }
    document.getElementById('questionText').innerHTML = questionHtml;

    // 渲染选项（含图片）
    const optionImages = rich.option_images || {};
    const optionsHtml = Object.entries(question.options || {}).map(([key, value]) => {
        const imgHtml = optionImages[key] ? renderImages(optionImages[key]) : '';
        return `
            <div class="option-card" data-key="${key}" onclick="selectOption('${key}')">
                <div class="option-key">${key}</div>
                <div class="option-content">${value}${imgHtml}</div>
            </div>
        `;
    }).join('');
    document.getElementById('optionsContainer').innerHTML = optionsHtml;

    // 恢复之前的答题状态
    const state = answerState[question.id];
    if (state) {
        answered = true;
        selectedOption = state.selected;
        showResult(state.selected, question.answer, state.correct);
    } else {
        answered = false;
        selectedOption = null;
        document.getElementById('explanation').classList.remove('show');
    }

    updateProgress();
    updateNavButtons();
}

function selectOption(key) {
    if (answered) return;

    selectedOption = key;
    answered = true;

    const question = questions[currentIndex];
    const qid = String(question.id);
    const isCorrect = key === question.answer;

    // 记录答题结果（使用 String 比较）
    if (isCorrect) {
        // 从错题列表移除（如果在错题模式下答对）
        const wrongIdx = wrongList.findIndex(id => String(id) === qid);
        if (wrongIdx >= 0) wrongList.splice(wrongIdx, 1);
        // 添加到正确列表
        if (!correctList.some(id => String(id) === qid)) correctList.push(question.id);
    } else {
        // 从正确列表移除（如果之前答对过）
        const correctIdx = correctList.findIndex(id => String(id) === qid);
        if (correctIdx >= 0) correctList.splice(correctIdx, 1);
        // 添加到错题列表
        if (!wrongList.some(id => String(id) === qid)) wrongList.push(question.id);

        // 错题模式下做错：将题目重新加入队列末尾，循环练习
        if (practiceMode === 'wrong') {
            // 清除当前答题状态，以便再次作答
            setTimeout(() => {
                delete answerState[question.id];
                // 将当前题目克隆后加入队列末尾
                questions.push({ ...question });
                showToast('再错一次，已加入后续继续练习', 'error');
            }, 1500);
        }
    }

    answerState[question.id] = { selected: key, correct: isCorrect };
    showResult(key, question.answer, isCorrect);
    updateStats();
    saveProgress();
}

function showResult(selected, correct, isCorrect) {
    const options = document.querySelectorAll('.option-card');
    options.forEach(opt => {
        opt.classList.add('disabled');
        const key = opt.dataset.key;
        if (key === correct) {
            opt.classList.add('correct');
        } else if (key === selected && !isCorrect) {
            opt.classList.add('wrong');
        }
        if (key === selected) {
            opt.classList.add('selected');
        }
    });

    // 显示解析（含图片）
    const question = questions[currentIndex];
    const rich = question.rich_content || {};
    let explanationHtml = `<div>${question.explanation || '暂无解析'}</div>`;
    if (rich.explanation_images && rich.explanation_images.length > 0) {
        explanationHtml += `<div class="explanation-images">${renderImages(rich.explanation_images)}</div>`;
    }
    document.getElementById('explanationText').innerHTML = explanationHtml;
    document.getElementById('explanation').classList.add('show');
}

// ========== 导航 ==========
function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
}

function nextQuestion() {
    if (currentIndex < questions.length - 1) {
        currentIndex++;
        renderQuestion();
    } else {
        // 已到最后一题
        showToast('已完成全部题目', 'success');
    }
}

function updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex >= questions.length - 1;

    // 更新按钮文字（最后一题时显示"完成"）
    if (currentIndex >= questions.length - 1) {
        nextBtn.textContent = '✓ 完成';
    } else {
        nextBtn.textContent = '下一题 →';
    }
}

function updateProgress() {
    const progress = questions.length ? ((currentIndex + 1) / questions.length * 100) : 0;
    document.getElementById('progressFill').style.width = progress + '%';
}

// ========== 统计 ==========
function updateStats() {
    const total = questions.length;
    const correct = correctList.length;
    const wrong = wrongList.length;
    const answeredCount = correct + wrong;
    const accuracy = answeredCount > 0 ? Math.round(correct / answeredCount * 100) : 0;

    document.getElementById('statAccuracy').textContent = accuracy + '%';
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCorrect').textContent = correct;
    document.getElementById('statWrong').textContent = wrong;
}

// ========== 错题模式 ==========
function toggleWrongMode() {
    const btn = document.getElementById('wrongModeBtn');
    const banner = document.getElementById('wrongModeBanner');
    const exitBtn = document.getElementById('exitWrongBtn');

    if (practiceMode !== 'wrong') {
        if (wrongList.length === 0) {
            showToast('暂无错题', 'error');
            return;
        }
        practiceMode = 'wrong';
        btn.classList.add('active');
        if (banner) banner.style.display = 'flex';
        if (exitBtn) exitBtn.style.display = 'flex';
        questions = allQuestions.filter(q => wrongList.some(wid => String(wid) === String(q.id)));
        if (questions.length === 0) {
            showToast('暂无错题', 'error');
            practiceMode = 'all';
            btn.classList.remove('active');
            if (banner) banner.style.display = 'none';
            if (exitBtn) exitBtn.style.display = 'none';
            return;
        }
        questions.forEach(q => delete answerState[q.id]);
        currentIndex = 0;
        renderQuestion();
        showToast(`进入错题模式 (${questions.length}题)`, 'success');
    } else {
        exitWrongMode();
    }
    updateStats();
}

function exitWrongMode() {
    const btn = document.getElementById('wrongModeBtn');
    const banner = document.getElementById('wrongModeBanner');
    const exitBtn = document.getElementById('exitWrongBtn');

    practiceMode = 'all';
    btn.classList.remove('active');
    if (banner) banner.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    questions = allQuestions;
    currentIndex = 0;
    renderQuestion();
    updateStats();
    showToast('已退出错题模式', 'success');
}

// ========== 题目列表弹窗 ==========
function filterQuestions(type) {
    let filtered = [];
    let title = '';

    switch (type) {
        case 'all':
            filtered = allQuestions;
            title = `📋 全部题目 (${filtered.length}题)`;
            break;
        case 'correct':
            filtered = allQuestions.filter(q => correctList.some(id => String(id) === String(q.id)));
            title = `✅ 答对的题 (${filtered.length}题)`;
            break;
        case 'wrong':
            filtered = allQuestions.filter(q => wrongList.some(id => String(id) === String(q.id)));
            title = `❌ 答错的题 (${filtered.length}题)`;
            break;
    }

    if (filtered.length === 0) {
        showToast(`暂无${type === 'correct' ? '答对' : type === 'wrong' ? '答错' : ''}的题目`, 'error');
        return;
    }

    // 显示弹窗
    document.getElementById('questionListTitle').textContent = title;
    const grid = document.getElementById('questionGrid');

    grid.innerHTML = filtered.map((q, idx) => {
        let status = '';
        const qid = String(q.id);
        if (correctList.some(id => String(id) === qid)) {
            status = 'correct';
        } else if (wrongList.some(id => String(id) === qid)) {
            status = 'wrong';
        }
        const isCurrent = questions[currentIndex]?.id === q.id;
        const currentClass = isCurrent ? 'current' : '';

        return `<div class="question-cell ${status} ${currentClass}" 
                     onclick="jumpToQuestion('${q.id}')" 
                     title="第${q.number || idx + 1}题">
                    ${q.number || idx + 1}
                </div>`;
    }).join('');

    document.getElementById('questionListModal').style.display = 'flex';
    closeSidebar();
}

function closeQuestionListModal() {
    document.getElementById('questionListModal').style.display = 'none';
}

function jumpToQuestion(questionId) {
    questions = allQuestions;
    practiceMode = 'all';
    document.getElementById('wrongModeBtn').classList.remove('active');

    // 修复类型比较问题
    const idx = questions.findIndex(q => String(q.id) === String(questionId));
    console.log('jumpToQuestion:', questionId, 'found idx:', idx);
    if (idx >= 0) {
        currentIndex = idx;
        renderQuestion();
        updateStats();
        closeQuestionListModal();
    } else {
        showToast('题目未找到', 'error');
    }
}

// ========== Sidebar ==========
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// ========== 上传功能 ==========
let selectedUploadFile = null;

function openUploadModal() {
    document.getElementById('uploadModal').style.display = 'flex';
    document.getElementById('uploadFileInput').value = '';
    document.getElementById('uploadStatus').textContent = '';
    document.getElementById('selectedFile').classList.remove('show');
    selectedUploadFile = null;
    closeSidebar();
    initDropZone();
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    selectedUploadFile = null;
}

function initDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('uploadFileInput');

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // 点击选择文件
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    if (!file.name.endsWith('.md')) {
        showToast('只支持 .md 文件', 'error');
        return;
    }
    selectedUploadFile = file;
    const selectedDiv = document.getElementById('selectedFile');
    selectedDiv.innerHTML = `📄 <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    selectedDiv.classList.add('show');
    document.getElementById('uploadStatus').textContent = '';
}

async function handleUpload() {
    const statusDiv = document.getElementById('uploadStatus');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!selectedUploadFile) {
        statusDiv.textContent = '⚠️ 请先选择或拖入文件';
        statusDiv.style.color = 'var(--error)';
        return;
    }

    statusDiv.textContent = '⏳ 正在上传...';
    statusDiv.style.color = 'var(--text-light)';
    uploadBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('file', selectedUploadFile);
        const apiBase = API_BASE;
        const response = await fetch(`${apiBase}/upload/markdown`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (result.success) {
            statusDiv.innerHTML = `✅ 导入成功!<br>章节: ${result.title}<br>入库: ${result.imported} 题`;
            statusDiv.style.color = 'var(--success)';
            showToast('导入成功!', 'success');
            setTimeout(() => {
                closeUploadModal();
                refreshCache();
            }, 1500);
        } else {
            statusDiv.textContent = `❌ 失败: ${result.error}`;
            statusDiv.style.color = 'var(--error)';
        }
    } catch (error) {
        statusDiv.textContent = `❌ 上传失败: ${error.message}`;
        statusDiv.style.color = 'var(--error)';
    } finally {
        uploadBtn.disabled = false;
    }
}

// ========== 题量设置 ==========
function openCountModal() {
    document.getElementById('totalSpan').textContent = allQuestions.length;
    document.getElementById('countInput').max = allQuestions.length;
    document.getElementById('countInput').value = Math.min(10, allQuestions.length);
    document.getElementById('countModal').style.display = 'flex';
    closeSidebar();
}

function cancelPracticeCount() {
    document.getElementById('countModal').style.display = 'none';
}

function confirmPracticeCount() {
    console.log('confirmPracticeCount called');
    const input = document.getElementById('countInput');
    const count = parseInt(input.value) || 1;
    const total = allQuestions.length;
    console.log('count:', count, 'total:', total);

    if (count < 1 || count > total) {
        showToast(`请输入 1-${total} 之间的数字`, 'error');
        return;
    }

    // 随机抽取指定数量的题目
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    questions = shuffled.slice(0, count);
    practiceCount = count;
    currentIndex = 0;

    // 重置答题状态
    correctList = [];
    wrongList = [];
    answerState = {};

    document.getElementById('countModal').style.display = 'none';
    renderQuestion();
    updateStats();
    console.log('questions.length after set:', questions.length);
    showToast(`已抽取 ${count} 道题目`, 'success');
}

// ========== 其他功能 ==========
function refreshCache() {
    localStorage.removeItem(getStorageKey());
    showToast('正在刷新...', 'success');
    setTimeout(() => location.reload(), 300);
}

function resetProgress() {
    if (!confirm('确定要重置所有进度吗?')) return;
    localStorage.removeItem(getStorageKey());
    resetSessionState();
    renderQuestion();
    showToast('进度已重置', 'success');
    closeSidebar();
}

function getStorageKey() {
    const code = currentChapter?.code || 'local';
    return `quiz_progress_${code}`;
}

function saveProgress() {
    try {
        const data = {
            index: currentIndex,
            correctList,
            wrongList,
            answerState,
            timestamp: Date.now()
        };
        localStorage.setItem(getStorageKey(), JSON.stringify(data));
    } catch (e) {
        console.warn('保存进度失败', e);
    }
}

function loadProgress() {
    try {
        const data = JSON.parse(localStorage.getItem(getStorageKey()));
        if (data) {
            currentIndex = data.index || 0;
            correctList = data.correctList || [];
            wrongList = data.wrongList || [];
            answerState = data.answerState || {};
        }
    } catch (e) {
        console.warn('加载进度失败', e);
    }
}

function backToQuiz() {
    viewMode = 'quiz';
    document.getElementById('historyPanel').style.display = 'none';
    document.getElementById('quizPanel').style.display = 'block';
}

function confirmPracticeCount() {
    document.getElementById('countModal').style.display = 'none';
}

function cancelPracticeCount() {
    document.getElementById('countModal').style.display = 'none';
}

// ========== Toast ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', () => {
    loadProgress();
    init();
});
