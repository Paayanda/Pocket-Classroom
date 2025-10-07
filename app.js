const StorageManager = {
    CAPSULES_KEY: 'pocketClassroom_capsules',
    PROGRESS_KEY: 'pocketClassroom_progress',

    getCapsules() {
        const data = localStorage.getItem(this.CAPSULES_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveCapsules(capsules) {
        localStorage.setItem(this.CAPSULES_KEY, JSON.stringify(capsules));
    },

    getProgress() {
        const data = localStorage.getItem(this.PROGRESS_KEY);
        return data ? JSON.parse(data) : {};
    },

    saveProgress(progress) {
        localStorage.setItem(this.PROGRESS_KEY, JSON.stringify(progress));
    }
};

const CapsuleManager = {
    capsules: [],
    currentCapsule: null,
    autoSaveTimeout: null,
    formObserver: null,

    init() {
        this.capsules = StorageManager.getCapsules();
        this.renderCapsules();
        this.attachEventListeners();
        this.renderLessons();
    },

    attachEventListeners() {
        document.getElementById('btnNewCapsule').addEventListener('click', () => this.openNewCapsuleModal());
        document.getElementById('btnImportCapsule').addEventListener('click', () => document.getElementById('fileImport').click());
        document.getElementById('fileImport').addEventListener('change', (e) => this.importCapsule(e));
        document.getElementById('saveCapsule').addEventListener('click', () => this.saveCapsule());
        document.getElementById('capsuleType').addEventListener('change', (e) => this.renderContentForm(e.target.value));

        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-learn')) {
                const id = e.target.closest('.btn-learn').dataset.id;
                this.openLearnMode(id);
            }
            if (e.target.closest('.btn-edit')) {
                const id = e.target.closest('.btn-edit').dataset.id;
                this.editCapsule(id);
            }
            if (e.target.closest('.btn-delete')) {
                const id = e.target.closest('.btn-delete').dataset.id;
                this.deleteCapsule(id);
            }
            if (e.target.closest('.btn-export')) {
                const id = e.target.closest('.btn-export').dataset.id;
                this.exportCapsule(id);
            }
        });
    },

    openNewCapsuleModal() {
        this.currentCapsule = null;
        document.getElementById('capsuleForm').reset();
        document.getElementById('contentArea').innerHTML = '';
        document.getElementById('capsuleModalLabel').textContent = 'Create New Capsule';
        const modal = new bootstrap.Modal(document.getElementById('capsuleModal'));
        modal.show();
    },

    renderContentForm(type) {
        const contentArea = document.getElementById('contentArea');
        
        if (!type) {
            contentArea.innerHTML = '';
            return;
        }

        let html = '';
        
        if (type === 'notes') {
            html = `
                <div class="mb-3">
                    <label class="form-label">Notes Content *</label>
                    <textarea class="form-control" id="notesContent" rows="8" required placeholder="Write your notes here..."></textarea>
                </div>
            `;
        } else if (type === 'flashcards') {
            html = `
                <div class="mb-3">
                    <label class="form-label">Flashcards</label>
                    <div id="flashcardsContainer"></div>
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="CapsuleManager.addFlashcard()">
                        <i class="bi bi-plus"></i> Add Flashcard
                    </button>
                </div>
            `;
        } else if (type === 'quiz') {
            html = `
                <div class="mb-3">
                    <label class="form-label">Quiz Questions</label>
                    <div id="quizContainer"></div>
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="CapsuleManager.addQuizQuestion()">
                        <i class="bi bi-plus"></i> Add Question
                    </button>
                </div>
            `;
        }

        contentArea.innerHTML = html;

        if (this.currentCapsule) {
            if (type === 'notes') {
                document.getElementById('notesContent').value = this.currentCapsule.content || '';
            } else if (type === 'flashcards') {
                this.currentCapsule.content.forEach(() => this.addFlashcard());
                this.currentCapsule.content.forEach((fc, i) => {
                    document.querySelectorAll('.flashcard-front-input')[i].value = fc.front;
                    document.querySelectorAll('.flashcard-back-input')[i].value = fc.back;
                });
            } else if (type === 'quiz') {
                this.currentCapsule.content.forEach(() => this.addQuizQuestion());
                this.currentCapsule.content.forEach((q, i) => {
                    document.querySelectorAll('.quiz-question-input')[i].value = q.question;
                    q.options.forEach((opt, j) => {
                        document.querySelectorAll(`.quiz-options-${i} input`)[j].value = opt;
                    });
                    document.querySelectorAll('.quiz-correct-input')[i].value = q.correct;
                });
            }
        }

        if (type === 'flashcards' && (!this.currentCapsule || this.currentCapsule.content.length === 0)) {
            this.addFlashcard();
        }
        if (type === 'quiz' && (!this.currentCapsule || this.currentCapsule.content.length === 0)) {
            this.addQuizQuestion();
        }

        this.setupAutoSave();
    },

    setupAutoSave() {
        if (this.formObserver) {
            this.formObserver.disconnect();
        }

        const form = document.getElementById('capsuleForm');
        const inputs = form.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            if (!input.hasAttribute('data-autosave')) {
                input.setAttribute('data-autosave', 'true');
                input.addEventListener('input', () => this.triggerAutoSave());
            }
        });

        this.formObserver = new MutationObserver(() => {
            const newInputs = form.querySelectorAll('input, textarea, select');
            newInputs.forEach(input => {
                if (!input.hasAttribute('data-autosave')) {
                    input.setAttribute('data-autosave', 'true');
                    input.addEventListener('input', () => this.triggerAutoSave());
                }
            });
        });

        this.formObserver.observe(form, { childList: true, subtree: true });
    },

    triggerAutoSave() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.autoSaveTimeout = setTimeout(() => {
            this.autoSaveCapsule();
        }, 1000);
    },

    autoSaveCapsule() {
        const title = document.getElementById('capsuleTitle').value.trim();
        const type = document.getElementById('capsuleType').value;

        if (!title || !type) {
            return;
        }

        const description = document.getElementById('capsuleDescription').value.trim();
        let content;
        let isValid = false;

        if (type === 'notes') {
            content = document.getElementById('notesContent').value.trim();
            isValid = content.length > 0;
        } else if (type === 'flashcards') {
            const fronts = Array.from(document.querySelectorAll('.flashcard-front-input')).map(el => el.value.trim());
            const backs = Array.from(document.querySelectorAll('.flashcard-back-input')).map(el => el.value.trim());
            
            content = fronts.map((front, i) => {
                const known = this.currentCapsule && this.currentCapsule.content[i] ? this.currentCapsule.content[i].known : false;
                return { front, back: backs[i], known };
            });
            isValid = content.length > 0 && content.every(fc => fc.front && fc.back);
        } else if (type === 'quiz') {
            const quizItems = Array.from(document.querySelectorAll('.quiz-item'));
            
            content = quizItems.map(item => {
                const question = item.querySelector('.quiz-question-input').value.trim();
                const optionInputs = Array.from(item.querySelectorAll('[class*="quiz-options-"] input'));
                const options = optionInputs.map(el => el.value.trim());
                const correctValue = item.querySelector('.quiz-correct-input').value;
                
                const hasAllOptions = options.length === 4 && options.every(opt => opt.length > 0);
                const hasCorrectAnswer = correctValue !== '';
                
                if (!question || !hasAllOptions || !hasCorrectAnswer) {
                    return null;
                }
                
                return {
                    question,
                    options,
                    correct: parseInt(correctValue)
                };
            }).filter(q => q !== null);
            
            isValid = content.length > 0;
        }

        if (!isValid) {
            return;
        }

        const capsule = {
            id: this.currentCapsule ? this.currentCapsule.id : Date.now().toString(),
            title,
            description,
            type,
            content,
            createdAt: this.currentCapsule ? this.currentCapsule.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (this.currentCapsule) {
            const index = this.capsules.findIndex(c => c.id === this.currentCapsule.id);
            this.capsules[index] = capsule;
            this.currentCapsule = capsule;
        } else {
            this.capsules.push(capsule);
            this.currentCapsule = capsule;
        }

        StorageManager.saveCapsules(this.capsules);
        this.renderCapsules();
        this.showAutoSave();
    },

    addFlashcard() {
        const container = document.getElementById('flashcardsContainer');
        const index = container.children.length;
        const html = `
            <div class="flashcard-item">
                <div class="mb-2">
                    <input type="text" class="form-control form-control-sm flashcard-front-input" placeholder="Front (Question)" required>
                </div>
                <div class="mb-2">
                    <input type="text" class="form-control form-control-sm flashcard-back-input" placeholder="Back (Answer)" required>
                </div>
                <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    },

    addQuizQuestion() {
        const container = document.getElementById('quizContainer');
        const index = container.children.length;
        const html = `
            <div class="quiz-item">
                <div class="mb-2">
                    <input type="text" class="form-control form-control-sm quiz-question-input" placeholder="Question" required>
                </div>
                <div class="mb-2 quiz-options-${index}">
                    <input type="text" class="form-control form-control-sm mb-1" placeholder="Option 1" required>
                    <input type="text" class="form-control form-control-sm mb-1" placeholder="Option 2" required>
                    <input type="text" class="form-control form-control-sm mb-1" placeholder="Option 3" required>
                    <input type="text" class="form-control form-control-sm mb-1" placeholder="Option 4" required>
                </div>
                <div class="mb-2">
                    <select class="form-select form-select-sm quiz-correct-input" required>
                        <option value="">Correct answer...</option>
                        <option value="0">Option 1</option>
                        <option value="1">Option 2</option>
                        <option value="2">Option 3</option>
                        <option value="3">Option 4</option>
                    </select>
                </div>
                <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    },

    saveCapsule() {
        const title = document.getElementById('capsuleTitle').value.trim();
        const description = document.getElementById('capsuleDescription').value.trim();
        const type = document.getElementById('capsuleType').value;

        if (!title || !type) {
            alert('Please fill in all required fields');
            return;
        }

        let content;

        if (type === 'notes') {
            content = document.getElementById('notesContent').value.trim();
            if (!content) {
                alert('Please add notes content');
                return;
            }
        } else if (type === 'flashcards') {
            const fronts = Array.from(document.querySelectorAll('.flashcard-front-input')).map(el => el.value.trim());
            const backs = Array.from(document.querySelectorAll('.flashcard-back-input')).map(el => el.value.trim());
            
            if (fronts.some(f => !f) || backs.some(b => !b)) {
                alert('Please fill in all flashcards');
                return;
            }

            content = fronts.map((front, i) => ({ front, back: backs[i], known: false }));
        } else if (type === 'quiz') {
            const quizItems = Array.from(document.querySelectorAll('.quiz-item'));
            
            content = quizItems.map(item => {
                const question = item.querySelector('.quiz-question-input').value.trim();
                const optionInputs = Array.from(item.querySelectorAll('[class*="quiz-options-"] input'));
                const options = optionInputs.map(el => el.value.trim());
                const correctValue = item.querySelector('.quiz-correct-input').value;
                
                if (!question) {
                    alert('Please fill in all quiz questions');
                    return null;
                }
                
                if (options.length !== 4 || options.some(o => !o)) {
                    alert('Please fill in all 4 options for each question');
                    return null;
                }
                
                if (correctValue === '') {
                    alert('Please select the correct answer for each question');
                    return null;
                }
                
                return {
                    question,
                    options,
                    correct: parseInt(correctValue)
                };
            }).filter(q => q !== null);

            if (content.length === 0) {
                return;
            }
        }

        const capsule = {
            id: this.currentCapsule ? this.currentCapsule.id : Date.now().toString(),
            title,
            description,
            type,
            content,
            createdAt: this.currentCapsule ? this.currentCapsule.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (this.currentCapsule) {
            const index = this.capsules.findIndex(c => c.id === this.currentCapsule.id);
            this.capsules[index] = capsule;
        } else {
            this.capsules.push(capsule);
        }

        StorageManager.saveCapsules(this.capsules);
        this.renderCapsules();
        this.showAutoSave();
        
        bootstrap.Modal.getInstance(document.getElementById('capsuleModal')).hide();
    },

    editCapsule(id) {
        this.currentCapsule = this.capsules.find(c => c.id === id);
        document.getElementById('capsuleTitle').value = this.currentCapsule.title;
        document.getElementById('capsuleDescription').value = this.currentCapsule.description;
        document.getElementById('capsuleType').value = this.currentCapsule.type;
        document.getElementById('capsuleModalLabel').textContent = 'Edit Capsule';
        
        this.renderContentForm(this.currentCapsule.type);
        
        const modal = new bootstrap.Modal(document.getElementById('capsuleModal'));
        modal.show();
    },

    deleteCapsule(id) {
        if (confirm('Are you sure you want to delete this capsule?')) {
            this.capsules = this.capsules.filter(c => c.id !== id);
            StorageManager.saveCapsules(this.capsules);
            this.renderCapsules();
        }
    },

    renderCapsules() {
        const container = document.getElementById('capsulesContainer');
        const emptyState = document.getElementById('emptyState');

        if (this.capsules.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        const html = this.capsules.map(capsule => {
            const typeClass = `capsule-type-${capsule.type}`;
            const typeName = capsule.type.charAt(0).toUpperCase() + capsule.type.slice(1);
            const count = Array.isArray(capsule.content) ? capsule.content.length : 1;
            const itemText = capsule.type === 'notes' ? 'note' : capsule.type === 'flashcards' ? 'cards' : 'questions';

            return `
                <div class="col-md-6 col-lg-4">
                    <div class="capsule-card">
                        <div class="capsule-type-badge ${typeClass}">${typeName}</div>
                        <h5 class="capsule-title">${capsule.title}</h5>
                        ${capsule.description ? `<p class="capsule-description">${capsule.description}</p>` : ''}
                        <div class="capsule-stats">
                            <span><i class="bi bi-file-text"></i> ${count} ${itemText}</span>
                            <span><i class="bi bi-clock"></i> ${new Date(capsule.updatedAt).toLocaleDateString()}</span>
                        </div>
                        <div class="capsule-actions">
                            <button class="btn btn-primary btn-sm btn-learn" data-id="${capsule.id}">
                                <i class="bi bi-play-fill"></i> Learn
                            </button>
                            <button class="btn btn-outline-primary btn-sm btn-edit" data-id="${capsule.id}">
                                <i class="bi bi-pencil"></i> Edit
                            </button>
                            <button class="btn btn-outline-primary btn-sm btn-export" data-id="${capsule.id}">
                                <i class="bi bi-download"></i> Export
                            </button>
                            <button class="btn btn-outline-danger btn-sm btn-delete" data-id="${capsule.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    },

    openLearnMode(id) {
        const capsule = this.capsules.find(c => c.id === id);
        const modal = new bootstrap.Modal(document.getElementById('learnModal'));
        document.getElementById('learnModalTitle').textContent = capsule.title;

        let html = '';

        if (capsule.type === 'notes') {
            html = `
                <div class="notes-content">
                    <p style="white-space: pre-wrap;">${capsule.content}</p>
                </div>
            `;
        } else if (capsule.type === 'flashcards') {
            const progress = StorageManager.getProgress();
            const capsuleProgress = progress[capsule.id] || { known: [] };

            html = `
                <div id="flashcardLearn">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <span class="badge bg-success">Known: <span id="knownCount">${capsuleProgress.known.length}</span></span>
                            <span class="badge bg-warning">Unknown: <span id="unknownCount">${capsule.content.length - capsuleProgress.known.length}</span></span>
                        </div>
                        <div>
                            <span id="cardCounter">1 / ${capsule.content.length}</span>
                        </div>
                    </div>
                    <div class="flashcard" id="currentFlashcard">
                        <div class="flashcard-inner">
                            <div class="flashcard-front">
                                <h4 id="flashcardFront">${capsule.content[0].front}</h4>
                            </div>
                            <div class="flashcard-back">
                                <h4 id="flashcardBack">${capsule.content[0].back}</h4>
                            </div>
                        </div>
                    </div>
                    <div class="d-flex justify-content-center gap-3">
                        <button class="btn btn-outline-primary" onclick="CapsuleManager.flipCard()">
                            <i class="bi bi-arrow-repeat"></i> Flip Card
                        </button>
                        <button class="btn btn-danger" onclick="CapsuleManager.markCard('${capsule.id}', false)">
                            <i class="bi bi-x-circle"></i> Don't Know
                        </button>
                        <button class="btn btn-success" onclick="CapsuleManager.markCard('${capsule.id}', true)">
                            <i class="bi bi-check-circle"></i> Know It
                        </button>
                    </div>
                </div>
            `;
            
            this.currentLearnCapsule = capsule;
            this.currentCardIndex = 0;
        } else if (capsule.type === 'quiz') {
            html = `
                <div id="quizLearn">
                    <div id="quizQuestions">
                        ${capsule.content.map((q, i) => `
                            <div class="quiz-question" id="question-${i}">
                                <h5 class="mb-3">Question ${i + 1}: ${q.question}</h5>
                                <div class="quiz-options-list">
                                    ${q.options.map((opt, j) => `
                                        <div class="quiz-option" data-question="${i}" data-option="${j}">
                                            ${opt}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="text-center mt-4">
                        <button class="btn btn-primary btn-lg" onclick="CapsuleManager.submitQuiz('${capsule.id}')">
                            <i class="bi bi-check-circle"></i> Submit Quiz
                        </button>
                    </div>
                    <div id="quizResult" class="mt-4" style="display: none;"></div>
                </div>
            `;

            setTimeout(() => {
                document.querySelectorAll('.quiz-option').forEach(opt => {
                    opt.addEventListener('click', function() {
                        const question = this.dataset.question;
                        document.querySelectorAll(`.quiz-option[data-question="${question}"]`).forEach(o => {
                            o.classList.remove('selected');
                        });
                        this.classList.add('selected');
                    });
                });
            }, 100);
        }

        document.getElementById('learnContent').innerHTML = html;
        modal.show();
    },

    flipCard() {
        document.getElementById('currentFlashcard').classList.toggle('flipped');
    },

    markCard(capsuleId, known) {
        const capsule = this.capsules.find(c => c.id === capsuleId);
        const progress = StorageManager.getProgress();
        
        if (!progress[capsuleId]) {
            progress[capsuleId] = { known: [] };
        }

        const currentCard = capsule.content[this.currentCardIndex];
        const cardId = `${currentCard.front}-${currentCard.back}`;

        if (known && !progress[capsuleId].known.includes(cardId)) {
            progress[capsuleId].known.push(cardId);
        } else if (!known && progress[capsuleId].known.includes(cardId)) {
            progress[capsuleId].known = progress[capsuleId].known.filter(id => id !== cardId);
        }

        StorageManager.saveProgress(progress);

        document.getElementById('knownCount').textContent = progress[capsuleId].known.length;
        document.getElementById('unknownCount').textContent = capsule.content.length - progress[capsuleId].known.length;

        this.currentCardIndex++;
        if (this.currentCardIndex >= capsule.content.length) {
            this.currentCardIndex = 0;
        }

        const card = document.getElementById('currentFlashcard');
        card.classList.remove('flipped');
        
        setTimeout(() => {
            document.getElementById('flashcardFront').textContent = capsule.content[this.currentCardIndex].front;
            document.getElementById('flashcardBack').textContent = capsule.content[this.currentCardIndex].back;
            document.getElementById('cardCounter').textContent = `${this.currentCardIndex + 1} / ${capsule.content.length}`;
        }, 300);
    },

    submitQuiz(capsuleId) {
        const capsule = this.capsules.find(c => c.id === capsuleId);
        let score = 0;
        const answers = [];

        capsule.content.forEach((q, i) => {
            const selected = document.querySelector(`.quiz-option[data-question="${i}"].selected`);
            const selectedOption = selected ? parseInt(selected.dataset.option) : -1;
            
            answers.push(selectedOption);

            if (selectedOption === q.correct) {
                score++;
                selected.classList.add('correct');
            } else {
                if (selected) selected.classList.add('incorrect');
                document.querySelector(`.quiz-option[data-question="${i}"][data-option="${q.correct}"]`).classList.add('correct');
            }
        });

        const percentage = Math.round((score / capsule.content.length) * 100);

        const progress = StorageManager.getProgress();
        if (!progress[capsuleId]) {
            progress[capsuleId] = {};
        }
        if (!progress[capsuleId].bestScore || percentage > progress[capsuleId].bestScore) {
            progress[capsuleId].bestScore = percentage;
        }
        StorageManager.saveProgress(progress);

        const resultHtml = `
            <div class="alert alert-${percentage >= 70 ? 'success' : 'warning'} text-center">
                <h4>Quiz Complete!</h4>
                <p class="mb-0">You scored ${score} out of ${capsule.content.length} (${percentage}%)</p>
                ${progress[capsuleId].bestScore ? `<p class="mb-0 mt-2"><small>Best Score: ${progress[capsuleId].bestScore}%</small></p>` : ''}
            </div>
        `;

        document.getElementById('quizResult').innerHTML = resultHtml;
        document.getElementById('quizResult').style.display = 'block';
        document.querySelector('.btn-primary.btn-lg').style.display = 'none';
    },

    exportCapsule(id) {
        const capsule = this.capsules.find(c => c.id === id);
        const dataStr = JSON.stringify(capsule, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${capsule.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    },

    importCapsule(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const capsule = JSON.parse(e.target.result);
                
                if (!capsule.title || !capsule.type || !capsule.content) {
                    throw new Error('Invalid capsule format');
                }

                capsule.id = Date.now().toString();
                capsule.createdAt = new Date().toISOString();
                capsule.updatedAt = new Date().toISOString();

                this.capsules.push(capsule);
                StorageManager.saveCapsules(this.capsules);
                this.renderCapsules();
                
                alert('Capsule imported successfully!');
            } catch (error) {
                alert('Error importing capsule: ' + error.message);
            }
        };
        reader.readAsText(file);
        
        event.target.value = '';
    },

    showAutoSave() {
        const indicator = document.createElement('div');
        indicator.className = 'auto-save-indicator show';
        indicator.innerHTML = '<i class="bi bi-check-circle me-2"></i>Saved';
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            indicator.classList.remove('show');
            setTimeout(() => indicator.remove(), 300);
        }, 2000);
    },

    renderLessons() {
        const lessons = [
            {
                title: 'HTML Basics',
                icon: 'bi-file-code',
                content: 'Learn HTML structure, elements, tags, and semantic markup. Master forms, tables, lists, and media elements.',
                resources: [
                    { name: 'W3Schools HTML Tutorial', url: 'https://www.w3schools.com/html/' },
                    { name: 'MDN HTML Guide', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML' },
                    { name: 'freeCodeCamp HTML Course', url: 'https://www.freecodecamp.org/learn/responsive-web-design/' }
                ],
                topics: ['HTML5 Semantic Elements', 'Forms & Input Types', 'Tables & Lists', 'Images & Media', 'Links & Navigation'],
                projectTitle: 'Personal Portfolio Page',
                projectId: 'html-portfolio'
            },
            {
                title: 'CSS Styling',
                icon: 'bi-palette',
                content: 'Master CSS selectors, box model, flexbox, grid layouts, animations, and responsive design principles.',
                resources: [
                    { name: 'W3Schools CSS Tutorial', url: 'https://www.w3schools.com/css/' },
                    { name: 'CSS-Tricks Complete Guide', url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/' },
                    { name: 'Codecademy CSS Course', url: 'https://www.codecademy.com/catalog/language/html-css' }
                ],
                topics: ['Selectors & Specificity', 'Flexbox & Grid', 'Animations & Transitions', 'Responsive Design', 'CSS Variables'],
                projectTitle: 'Responsive Card Gallery',
                projectId: 'css-gallery'
            },
            {
                title: 'JavaScript Fundamentals',
                icon: 'bi-lightning',
                content: 'Understand variables, functions, DOM manipulation, events, arrays, objects, and ES6+ features.',
                resources: [
                    { name: 'W3Schools JavaScript Tutorial', url: 'https://www.w3schools.com/js/' },
                    { name: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide' },
                    { name: 'JavaScript.info', url: 'https://javascript.info/' }
                ],
                topics: ['Variables & Data Types', 'Functions & Scope', 'DOM Manipulation', 'Event Handling', 'Arrays & Objects', 'ES6 Features'],
                projectTitle: 'Interactive To-Do List',
                projectId: 'js-todo'
            },
            {
                title: 'Bootstrap Framework',
                icon: 'bi-bootstrap',
                content: 'Use Bootstrap components, grid system, utilities, and responsive classes for rapid development.',
                resources: [
                    { name: 'Bootstrap Official Docs', url: 'https://getbootstrap.com/docs/5.3/getting-started/introduction/' },
                    { name: 'W3Schools Bootstrap Tutorial', url: 'https://www.w3schools.com/bootstrap5/' },
                    { name: 'Scrimba Bootstrap Course', url: 'https://scrimba.com/learn/bootstrap4' }
                ],
                topics: ['Grid System', 'Components', 'Utilities', 'Forms', 'Navigation', 'Responsive Classes'],
                projectTitle: 'Modern Landing Page',
                projectId: 'bootstrap-landing'
            }
        ];

        const html = lessons.map(lesson => `
            <div class="col-md-6">
                <div class="lesson-card">
                    <div class="lesson-icon">
                        <i class="bi ${lesson.icon}"></i>
                    </div>
                    <h4 class="lesson-title">${lesson.title}</h4>
                    <div class="lesson-content mb-3">${lesson.content}</div>
                    
                    <div class="mb-3">
                        <h6 class="fw-bold text-primary mb-2"><i class="bi bi-book me-2"></i>Learning Resources</h6>
                        <div class="d-flex flex-column gap-1">
                            ${lesson.resources.map(res => `
                                <a href="${res.url}" target="_blank" class="text-decoration-none small">
                                    <i class="bi bi-link-45deg"></i> ${res.name}
                                </a>
                            `).join('')}
                        </div>
                    </div>

                    <div class="mb-3">
                        <h6 class="fw-bold text-primary mb-2"><i class="bi bi-list-check me-2"></i>Key Topics</h6>
                        <div class="d-flex flex-wrap gap-1">
                            ${lesson.topics.map(topic => `
                                <span class="badge bg-light text-dark border">${topic}</span>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="project-box">
                        <h6><i class="bi bi-code-square me-2"></i>Coding Project: ${lesson.projectTitle}</h6>
                        <div class="d-flex gap-2 mt-2">
                            <button class="btn btn-sm btn-primary" onclick="CapsuleManager.viewProject('${lesson.projectId}')">
                                <i class="bi bi-eye me-1"></i>View Project
                            </button>
                            <button class="btn btn-sm btn-outline-primary" onclick="CapsuleManager.showProjectCode('${lesson.projectId}')">
                                <i class="bi bi-file-code me-1"></i>View Code
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('lessonsContainer').innerHTML = html;
    },

    getProjectCode(projectId) {
        const projects = {
            'html-portfolio': {
                title: 'Personal Portfolio Page',
                description: 'A semantic HTML5 portfolio page with header, navigation, sections, and footer.',
                html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Portfolio</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; line-height: 1.6; }
        header { background: #447F98; color: white; padding: 2rem; text-align: center; }
        nav { background: #629BB5; padding: 1rem; }
        nav a { color: white; text-decoration: none; margin: 0 1rem; }
        section { padding: 2rem; max-width: 1200px; margin: 0 auto; }
        footer { background: #447F98; color: white; text-align: center; padding: 1rem; }
        .skill { display: inline-block; background: #B9D8E1; padding: 0.5rem 1rem; margin: 0.5rem; border-radius: 5px; }
    </style>
</head>
<body>
    <header>
        <h1>John Doe</h1>
        <p>Web Developer & Designer</p>
    </header>
    
    <nav>
        <a href="#about">About</a>
        <a href="#skills">Skills</a>
        <a href="#projects">Projects</a>
        <a href="#contact">Contact</a>
    </nav>
    
    <section id="about">
        <h2>About Me</h2>
        <p>I'm a passionate web developer with expertise in creating beautiful and functional websites.</p>
    </section>
    
    <section id="skills">
        <h2>Skills</h2>
        <div class="skill">HTML5</div>
        <div class="skill">CSS3</div>
        <div class="skill">JavaScript</div>
        <div class="skill">Bootstrap</div>
    </section>
    
    <section id="projects">
        <h2>My Projects</h2>
        <article>
            <h3>Project 1</h3>
            <p>Description of your amazing project goes here.</p>
        </article>
    </section>
    
    <section id="contact">
        <h2>Contact Me</h2>
        <form>
            <input type="text" placeholder="Your Name" required><br><br>
            <input type="email" placeholder="Your Email" required><br><br>
            <textarea placeholder="Message" rows="4" required></textarea><br><br>
            <button type="submit">Send Message</button>
        </form>
    </section>
    
    <footer>
        <p>&copy; 2024 John Doe. All rights reserved.</p>
    </footer>
</body>
</html>`
            },
            'css-gallery': {
                title: 'Responsive Card Gallery',
                description: 'A responsive gallery using CSS Grid and Flexbox with hover animations.',
                html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Card Gallery</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #D6EBF3; padding: 2rem; }
        
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .card {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-10px);
            box-shadow: 0 12px 24px rgba(0,0,0,0.2);
        }
        
        .card-icon {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #447F98, #629BB5);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            margin-bottom: 1rem;
        }
        
        .card h3 { color: #447F98; margin-bottom: 0.5rem; }
        .card p { color: #666; line-height: 1.6; }
        
        @media (max-width: 768px) {
            .gallery { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <h1 style="text-align: center; color: #447F98; margin-bottom: 2rem;">Our Services</h1>
    
    <div class="gallery">
        <div class="card">
            <div class="card-icon">🎨</div>
            <h3>Web Design</h3>
            <p>Beautiful, modern designs that captivate your audience and enhance user experience.</p>
        </div>
        
        <div class="card">
            <div class="card-icon">💻</div>
            <h3>Development</h3>
            <p>Clean, efficient code that brings your vision to life with the latest technologies.</p>
        </div>
        
        <div class="card">
            <div class="card-icon">📱</div>
            <h3>Responsive</h3>
            <p>Websites that look perfect on any device, from mobile phones to desktop screens.</p>
        </div>
        
        <div class="card">
            <div class="card-icon">⚡</div>
            <h3>Performance</h3>
            <p>Lightning-fast loading times and optimized performance for the best user experience.</p>
        </div>
        
        <div class="card">
            <div class="card-icon">🔒</div>
            <h3>Security</h3>
            <p>Robust security measures to protect your data and ensure safe browsing.</p>
        </div>
        
        <div class="card">
            <div class="card-icon">🚀</div>
            <h3>SEO Ready</h3>
            <p>Optimized for search engines to help you rank higher and reach more customers.</p>
        </div>
    </div>
</body>
</html>`
            },
            'js-todo': {
                title: 'Interactive To-Do List',
                description: 'A fully functional to-do list with add, delete, and mark complete features.',
                html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>To-Do List</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #D6EBF3, #B9D8E1);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }
        h1 { color: #447F98; margin-bottom: 1.5rem; text-align: center; }
        .input-group {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
        }
        input {
            flex: 1;
            padding: 0.75rem;
            border: 2px solid #DADEE1;
            border-radius: 6px;
            font-size: 1rem;
        }
        button {
            background: #629BB5;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            cursor: pointer;
            font-size: 1rem;
        }
        button:hover { background: #447F98; }
        .todo-list { list-style: none; }
        .todo-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: #D6EBF3;
            margin-bottom: 0.5rem;
            border-radius: 6px;
            transition: all 0.3s ease;
        }
        .todo-item:hover { background: #B9D8E1; }
        .todo-item.completed { opacity: 0.6; text-decoration: line-through; }
        .todo-text { flex: 1; }
        .delete-btn {
            background: #dc3545;
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
        }
        .delete-btn:hover { background: #c82333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📝 My To-Do List</h1>
        
        <div class="input-group">
            <input type="text" id="todoInput" placeholder="Add a new task...">
            <button onclick="addTodo()">Add</button>
        </div>
        
        <ul class="todo-list" id="todoList"></ul>
    </div>
    
    <script>
        let todos = JSON.parse(localStorage.getItem('todos')) || [];
        
        function renderTodos() {
            const list = document.getElementById('todoList');
            list.innerHTML = todos.map((todo, index) => \`
                <li class="todo-item \${todo.completed ? 'completed' : ''}">
                    <input type="checkbox" \${todo.completed ? 'checked' : ''} 
                           onchange="toggleTodo(\${index})">
                    <span class="todo-text">\${todo.text}</span>
                    <button class="delete-btn" onclick="deleteTodo(\${index})">Delete</button>
                </li>
            \`).join('');
        }
        
        function addTodo() {
            const input = document.getElementById('todoInput');
            const text = input.value.trim();
            if (text) {
                todos.push({ text, completed: false });
                input.value = '';
                saveTodos();
                renderTodos();
            }
        }
        
        function toggleTodo(index) {
            todos[index].completed = !todos[index].completed;
            saveTodos();
            renderTodos();
        }
        
        function deleteTodo(index) {
            todos.splice(index, 1);
            saveTodos();
            renderTodos();
        }
        
        function saveTodos() {
            localStorage.setItem('todos', JSON.stringify(todos));
        }
        
        document.getElementById('todoInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTodo();
        });
        
        renderTodos();
    </script>
</body>
</html>`
            },
            'bootstrap-landing': {
                title: 'Modern Landing Page',
                description: 'A professional landing page built with Bootstrap components and grid system.',
                html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modern Landing Page</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
    <style>
        .hero { background: linear-gradient(135deg, #447F98, #629BB5); color: white; padding: 100px 0; }
        .feature-icon { font-size: 3rem; color: #629BB5; }
        .cta { background: #D6EBF3; padding: 80px 0; }
    </style>
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
            <a class="navbar-brand" href="#">BrandName</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item"><a class="nav-link" href="#features">Features</a></li>
                    <li class="nav-item"><a class="nav-link" href="#pricing">Pricing</a></li>
                    <li class="nav-item"><a class="nav-link" href="#contact">Contact</a></li>
                </ul>
            </div>
        </div>
    </nav>

    <section class="hero text-center">
        <div class="container">
            <h1 class="display-3 fw-bold mb-4">Build Amazing Websites</h1>
            <p class="lead mb-4">The best platform to create stunning websites with ease</p>
            <button class="btn btn-light btn-lg">Get Started</button>
        </div>
    </section>

    <section id="features" class="py-5">
        <div class="container">
            <h2 class="text-center mb-5">Our Features</h2>
            <div class="row g-4">
                <div class="col-md-4 text-center">
                    <i class="bi bi-lightning-fill feature-icon"></i>
                    <h4 class="mt-3">Fast Performance</h4>
                    <p>Lightning-fast load times for better user experience</p>
                </div>
                <div class="col-md-4 text-center">
                    <i class="bi bi-phone-fill feature-icon"></i>
                    <h4 class="mt-3">Responsive Design</h4>
                    <p>Perfect on any device, from mobile to desktop</p>
                </div>
                <div class="col-md-4 text-center">
                    <i class="bi bi-shield-check feature-icon"></i>
                    <h4 class="mt-3">Secure & Reliable</h4>
                    <p>Built with security and reliability in mind</p>
                </div>
            </div>
        </div>
    </section>

    <section id="pricing" class="py-5 bg-light">
        <div class="container">
            <h2 class="text-center mb-5">Pricing Plans</h2>
            <div class="row g-4">
                <div class="col-md-4">
                    <div class="card text-center">
                        <div class="card-body">
                            <h3 class="card-title">Basic</h3>
                            <h2 class="my-4">$9<small>/mo</small></h2>
                            <ul class="list-unstyled">
                                <li>5 Projects</li>
                                <li>10GB Storage</li>
                                <li>Email Support</li>
                            </ul>
                            <button class="btn btn-primary mt-3">Choose Plan</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card text-center border-primary">
                        <div class="card-body">
                            <h3 class="card-title">Pro</h3>
                            <h2 class="my-4">$29<small>/mo</small></h2>
                            <ul class="list-unstyled">
                                <li>Unlimited Projects</li>
                                <li>100GB Storage</li>
                                <li>Priority Support</li>
                            </ul>
                            <button class="btn btn-primary mt-3">Choose Plan</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card text-center">
                        <div class="card-body">
                            <h3 class="card-title">Enterprise</h3>
                            <h2 class="my-4">$99<small>/mo</small></h2>
                            <ul class="list-unstyled">
                                <li>Unlimited Everything</li>
                                <li>1TB Storage</li>
                                <li>24/7 Support</li>
                            </ul>
                            <button class="btn btn-primary mt-3">Choose Plan</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section class="cta text-center">
        <div class="container">
            <h2 class="mb-4">Ready to Get Started?</h2>
            <p class="lead mb-4">Join thousands of happy customers today</p>
            <button class="btn btn-primary btn-lg">Start Free Trial</button>
        </div>
    </section>

    <footer class="bg-dark text-white text-center py-4">
        <p>&copy; 2024 BrandName. All rights reserved.</p>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`
            }
        };

        return projects[projectId];
    },

    viewProject(projectId) {
        const project = this.getProjectCode(projectId);
        if (!project) return;

        const newWindow = window.open('', '_blank');
        newWindow.document.write(project.html);
        newWindow.document.close();
    },

    showProjectCode(projectId) {
        const project = this.getProjectCode(projectId);
        if (!project) return;

        const modal = new bootstrap.Modal(document.getElementById('learnModal'));
        document.getElementById('learnModalTitle').textContent = `${project.title} - Source Code`;

        const html = `
            <div class="mb-3">
                <p class="text-muted">${project.description}</p>
            </div>
            <div class="d-flex gap-2 mb-3">
                <button class="btn btn-primary" onclick="CapsuleManager.viewProject('${projectId}')">
                    <i class="bi bi-eye me-1"></i>View Live Project
                </button>
                <button class="btn btn-outline-primary" onclick="CapsuleManager.copyCode('${projectId}')">
                    <i class="bi bi-clipboard me-1"></i>Copy Code
                </button>
            </div>
            <div class="bg-dark text-white p-3 rounded" style="max-height: 500px; overflow-y: auto;">
                <pre><code>${this.escapeHtml(project.html)}</code></pre>
            </div>
        `;

        document.getElementById('learnContent').innerHTML = html;
        modal.show();
    },

    copyCode(projectId) {
        const project = this.getProjectCode(projectId);
        if (!project) return;

        navigator.clipboard.writeText(project.html).then(() => {
            alert('Code copied to clipboard!');
        });
    },

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    CapsuleManager.init();

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
                
                const navCollapse = document.querySelector('.navbar-collapse');
                if (navCollapse.classList.contains('show')) {
                    bootstrap.Collapse.getInstance(navCollapse).hide();
                }
            }
        });
    });
});
