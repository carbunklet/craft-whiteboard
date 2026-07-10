// CraftBoard - Interactive Whiteboard JS Logic

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const canvas = document.getElementById('paint-canvas');
    const ctx = canvas.getContext('2d');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const pdfCtx = pdfCanvas.getContext('2d');
    const workspace = document.getElementById('workspace');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const overlay = document.getElementById('interactive-overlay');
    
    // Tools
    const toolSelect = document.getElementById('tool-select');
    const toolPencil = document.getElementById('tool-pencil');
    const toolHighlighter = document.getElementById('tool-highlighter');
    const toolText = document.getElementById('tool-text');
    const toolEraser = document.getElementById('tool-eraser');
    
    // Controls
    const btnTheme = document.getElementById('btn-theme');
    const themeIcon = document.getElementById('theme-icon');
    const btnGrid = document.getElementById('btn-grid');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnClear = document.getElementById('btn-clear');
    const btnExport = document.getElementById('btn-export');
    
    // PDF Navigation Controls
    const slideControls = document.getElementById('slide-controls');
    const btnPrevSlide = document.getElementById('btn-prev-slide');
    const btnNextSlide = document.getElementById('btn-next-slide');
    const btnClosePdf = document.getElementById('btn-close-pdf');
    const slideIndicator = document.getElementById('slide-indicator');
    const btnOpenPdf = document.getElementById('btn-open-pdf');
    const pdfFileInput = document.getElementById('pdf-file-input');

    // Brush Popover & Color Settings
    const colorPreviewBtn = document.getElementById('color-preview-btn');
    const brushPopover = document.getElementById('brush-popover');
    const activeColorBubble = document.getElementById('active-color-bubble');
    const colorPalette = document.getElementById('color-palette');
    const customColorInput = document.getElementById('custom-color');
    const brushThicknessInput = document.getElementById('brush-thickness');
    const thicknessValText = document.getElementById('thickness-val');
    const sizeDotPreview = document.getElementById('size-dot');
    
    // Font Size Controls
    const fontSizeToolbarBtn = document.getElementById('font-size-toolbar-btn');
    const fontSizeIndicator = document.getElementById('font-size-indicator');
    const fontSizePopover = document.getElementById('font-size-popover');
    const customFontSizeInput = document.getElementById('custom-font-size');
    const customFontSizeVal = document.getElementById('custom-font-size-val');
    
    // Lock Control
    const btnLockBoard = document.getElementById('btn-lock-board');
    const lockIcon = document.getElementById('lock-icon');
    
    // Toast
    const toast = document.getElementById('toast');

    // App State
    let activeTool = 'select'; // select, pencil, highlighter, text, eraser
    let activeColor = '#6366f1'; // Default Indigo
    let activeThickness = 5;
    let activeFontSize = 20; // Default font size (20px)
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    // Vector Drawing State
    let strokes = []; // list of all strokes: { id, points, tool, color, thickness }
    let currentStrokePoints = [];
    let selectedStroke = null;
    
    // PDF State
    let pdfDoc = null;
    let currentPdfPage = 1;
    let totalPdfPages = 0;
    let isPdfMode = false;
    let pageStates = {}; // key: pageNumber, value: { strokes: [...], textBoxes: [...], undoStack: [...], redoStack: [...] }
    let whiteboardBackupState = null;
    
    // Google Meet Add-on State
    let meetSession = null;
    let coDoingClient = null;
    let isBroadcasting = false; // Prevents infinite echo loops
    let broadcastTimeout = null;
    let isBoardLocked = false;
    let isTeacher = true; // True for meeting host/teacher, becomes false for students receiving remote states
    
    // Undo/Redo & Undo Stack (canvas drawing snapshot + text boxes state)
    let undoStack = [];
    let redoStack = [];
    const MAX_HISTORY = 40;
    
    // Text Boxes State
    let textBoxes = [];
    let selectedTextBox = null;
    let activeTextBoxDrag = null; // Reference to text box currently being dragged
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartLeft = 0;
    let dragStartTop = 0;

    // Color Swatches List
    const presetColors = [
        '#6366f1', // Indigo
        '#f43f5e', // Rose / Red
        '#10b981', // Emerald / Green
        '#eab308', // Yellow
        '#0ea5e9', // Sky Blue
        '#a855f7', // Purple
        '#ff7e33', // Orange
        '#ec4899', // Pink
        '#f4f4f5', // Soft White (High contrast for Dark Mode)
        '#1e293b'  // Charcoal (High contrast for Light Mode)
    ];

    // Initialize Lucide Icons
    lucide.createIcons();

    // Setup High-DPI Canvas
    function initCanvas() {
        if (isPdfMode) {
            // When in PDF mode, sizing is handled dynamically inside renderPdfPage
            return;
        }

        // Standard Whiteboard sizing
        canvasWrapper.style.width = '100%';
        canvasWrapper.style.height = '100%';
        canvasWrapper.style.position = 'absolute';

        const rect = canvasWrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Hide PDF canvas when not in PDF mode
        pdfCanvas.width = 0;
        pdfCanvas.height = 0;
        
        // Redraw existing vector strokes (scaled to new dimensions)
        scaleStrokesToPixels();
        redrawAllStrokes();
        
        updateCursorClass();
    }

    function clearCanvasDrawing() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Initialize Canvas on Load
    initCanvas();
    
    // Window Resize Handling (Debounced slightly)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (isPdfMode) {
                // Save current page state
                saveCurrentPageState();
                // Re-render current PDF page (which handles resizing canvasWrapper and both canvases)
                renderPdfPage(currentPdfPage);
            } else {
                // Store a snapshot of current canvas state
                const snapshot = saveState();
                initCanvas();
                // Restore snapshot to fit new canvas size
                restoreState(snapshot, false); // Don't modify undo/redo stacks
            }
        }, 100);
    });

    // Preset Color Palette Builder
    function initColorPalette() {
        colorPalette.innerHTML = '';
        presetColors.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            if (color === activeColor) swatch.classList.add('active');
            
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                setActiveColor(color);
                closeBrushPopover();
            });
            colorPalette.appendChild(swatch);
        });
        
        activeColorBubble.style.backgroundColor = activeColor;
        customColorInput.value = activeColor;
        updateBrushPreview();
    }
    
    initColorPalette();

    function setActiveColor(color) {
        activeColor = color;
        activeColorBubble.style.backgroundColor = color;
        customColorInput.value = color;
        
        // Highlight active swatch
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            const swatchColor = rgbToHex(swatch.style.backgroundColor);
            if (swatchColor === color.toLowerCase()) {
                swatch.classList.add('active');
            } else {
                swatch.classList.remove('active');
            }
        });
        
        updateBrushPreview();
        
        // If a text box is selected, change its color as well
        if (selectedTextBox) {
            const textarea = selectedTextBox.querySelector('textarea');
            textarea.style.color = color;
            
            const id = selectedTextBox.dataset.id;
            const tbState = textBoxes.find(t => t.id === id);
            if (tbState && tbState.color !== color) {
                tbState.color = color;
                saveSnapshot();
            }
        }
    }

    // Helper: Convert RGB string from element style to Hex
    function rgbToHex(rgb) {
        if (!rgb) return '';
        if (rgb.startsWith('#')) return rgb.toLowerCase();
        
        const rgbValues = rgb.match(/\d+/g);
        if (!rgbValues) return rgb;
        
        const r = parseInt(rgbValues[0]).toString(16).padStart(2, '0');
        const g = parseInt(rgbValues[1]).toString(16).padStart(2, '0');
        const b = parseInt(rgbValues[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // Custom Color Input Listener
    customColorInput.addEventListener('input', (e) => {
        setActiveColor(e.target.value);
    });

    // Thickness Input Listener
    brushThicknessInput.addEventListener('input', (e) => {
        activeThickness = parseInt(e.target.value);
        thicknessValText.textContent = `${activeThickness}px`;
        updateBrushPreview();
    });

    function updateBrushPreview() {
        sizeDotPreview.style.width = `${activeThickness}px`;
        sizeDotPreview.style.height = `${activeThickness}px`;
        sizeDotPreview.style.backgroundColor = activeColor;
    }

    // Brush Settings Popover Open/Close Logic
    colorPreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        brushPopover.classList.toggle('show');
    });

    // Close popovers if clicking outside
    document.addEventListener('click', (e) => {
        if (!brushPopover.contains(e.target) && e.target !== colorPreviewBtn) {
            closeBrushPopover();
        }
        
        // Deselect text box if clicking outside and tool is select
        if (activeTool === 'select' && selectedTextBox && !selectedTextBox.contains(e.target) && !e.target.closest('.controls-panel') && !e.target.closest('.toolbar-floating')) {
            deselectAllTextBoxes();
        }
    });

    function closeBrushPopover() {
        brushPopover.classList.remove('show');
    }

    // Tool Selection Event Listeners
    const tools = [
        { btn: toolSelect, id: 'select' },
        { btn: toolPencil, id: 'pencil' },
        { btn: toolHighlighter, id: 'highlighter' },
        { btn: toolText, id: 'text' },
        { btn: toolEraser, id: 'eraser' }
    ];

    tools.forEach(t => {
        t.btn.addEventListener('click', () => {
            selectTool(t.id);
        });
    });

    // Shortcut Keys for Tools
    document.addEventListener('keydown', (e) => {
        // Only trigger shortcut keys if the user is not typing in a text box
        if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
            return;
        }

        const key = e.key.toLowerCase();
        if (key === 'v') selectTool('select');
        else if (key === 'p') selectTool('pencil');
        else if (key === 'h') selectTool('highlighter');
        else if (key === 't') selectTool('text');
        else if (key === 'e') selectTool('eraser');
        else if (e.ctrlKey && key === 'z') {
            e.preventDefault();
            triggerUndo();
        } else if (e.ctrlKey && key === 'y') {
            e.preventDefault();
            triggerRedo();
        }
    });

    function selectTool(toolId) {
        if (isBoardLocked && !isTeacher && toolId !== 'select') {
            showToast("O professor bloqueou o quadro!", true);
            selectTool('select');
            return;
        }
        activeTool = toolId;
        
        tools.forEach(t => {
            if (t.id === toolId) {
                t.btn.classList.add('active');
            } else {
                t.btn.classList.remove('active');
            }
        });

        // Manage overlay clickability
        if (activeTool === 'select') {
            overlay.style.pointerEvents = 'auto';
        } else if (activeTool === 'text') {
            overlay.style.pointerEvents = 'auto';
            deselectAllTextBoxes();
            selectedStroke = null;
            redrawAllStrokes();
        } else {
            overlay.style.pointerEvents = 'none'; // Drawing passes through to canvas
            deselectAllTextBoxes();
            selectedStroke = null;
            redrawAllStrokes();
        }

        updateCursorClass();
        closeBrushPopover();
    }

    function updateCursorClass() {
        // Reset classes
        workspace.classList.remove('cursor-select', 'cursor-pencil', 'cursor-highlighter', 'cursor-text', 'cursor-eraser');
        // Add current tool class
        workspace.classList.add(`cursor-${activeTool}`);
    }

    // DRAWING LOGIC (Canvas mouse & touch events)

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function startDrawing(e) {
        if (activeTool === 'select' || activeTool === 'text') return;
        if (isBoardLocked && !isTeacher) {
            showToast("Quadro bloqueado pelo professor!", true);
            return;
        }
        
        isDrawing = true;
        const coords = getCoords(e);
        lastX = coords.x;
        lastY = coords.y;

        const rect = canvasWrapper.getBoundingClientRect();
        currentStrokePoints = [{
            x: lastX,
            y: lastY,
            xPct: lastX / (rect.width || 1),
            yPct: lastY / (rect.height || 1)
        }];

        // Context drawing settings
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        
        if (activeTool === 'pencil') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = activeThickness;
            ctx.globalAlpha = 1.0;
        } else if (activeTool === 'highlighter') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = activeThickness * 2.2;
            ctx.globalAlpha = 0.35;
        } else if (activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = activeThickness * 4; // Eraser is thicker
            ctx.globalAlpha = 1.0;
        }
    }

    function draw(e) {
        if (!isDrawing) return;
        
        const coords = getCoords(e);
        const rect = canvasWrapper.getBoundingClientRect();
        
        currentStrokePoints.push({
            x: coords.x,
            y: coords.y,
            xPct: coords.x / (rect.width || 1),
            yPct: coords.y / (rect.height || 1)
        });

        // Draw segment
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        
        // Save current point
        lastX = coords.x;
        lastY = coords.y;
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        ctx.closePath();
        
        if (currentStrokePoints.length > 0) {
            const strokeId = 'stroke-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            strokes.push({
                id: strokeId,
                points: [...currentStrokePoints],
                tool: activeTool,
                color: activeColor,
                thickness: activeTool === 'highlighter' ? activeThickness * 2.2 : (activeTool === 'eraser' ? activeThickness * 4 : activeThickness)
            });
        }
        
        // Save state snapshot for undo / redo
        saveSnapshot();
        redrawAllStrokes(); // ensure clean render
    }

    // Canvas Events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // Touch Events
    canvas.addEventListener('touchstart', (e) => {
        // Prevent default scrolling on mobile when drawing
        if (activeTool !== 'select' && activeTool !== 'text') {
            e.preventDefault();
        }
        startDrawing(e);
    });
    canvas.addEventListener('touchmove', (e) => {
        if (activeTool !== 'select' && activeTool !== 'text') {
            e.preventDefault();
        }
        draw(e);
    });
    canvas.addEventListener('touchend', stopDrawing);


    // TEXT BOX LOGIC

    // Click on overlay to spawn a Text Box or select a stroke
    overlay.addEventListener('mousedown', (e) => {
        if (activeTool === 'text') {
            if (isBoardLocked && !isTeacher) {
                showToast("Quadro bloqueado pelo professor!", true);
                return;
            }
            const rect = overlay.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            createTextBox(x, y - 10, "", true);
            // Revert back to Select Tool after creating a text box for easier styling/manipulation
            selectTool('select');
        } else if (activeTool === 'select') {
            const rect = overlay.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if click hits a stroke
            const stroke = findStrokeAt(x, y);
            if (stroke) {
                selectedStroke = stroke;
                deselectAllTextBoxes();
                redrawAllStrokes();
            } else {
                selectedStroke = null;
                deselectAllTextBoxes();
                redrawAllStrokes();
            }
        }
    });

    // Helper to dynamically adjust textarea dimensions
    function adjustTextarea(ta) {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
        
        const fontSize = parseInt(ta.style.fontSize) || 20;
        const charWidth = fontSize * 0.55;
        
        ta.style.width = 'auto';
        const lines = ta.value.split('\n');
        let maxCharLength = 0;
        lines.forEach(l => { if (l.length > maxCharLength) maxCharLength = l.length; });
        ta.style.width = `${Math.max(120, Math.min(800, maxCharLength * charWidth + 30))}px`;
    }

    function createTextBox(x, y, text = "", focusImmediately = false, id = null, color = null, fontSize = null, xPct = null, yPct = null) {
        const uniqueId = id || 'text-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const finalColor = color || activeColor;
        const finalFontSize = fontSize || `${activeFontSize}px`;
        const rect = canvasWrapper.getBoundingClientRect();

        // Compute actual pixels from percentages if provided
        const actualX = xPct !== null ? (xPct * rect.width) : x;
        const actualY = yPct !== null ? (yPct * rect.height) : y;
        
        const finalXPct = xPct !== null ? xPct : (x / (rect.width || 1));
        const finalYPct = yPct !== null ? yPct : (y / (rect.height || 1));

        // DOM element
        const tbDiv = document.createElement('div');
        tbDiv.className = 'text-box-container';
        tbDiv.style.left = `${actualX}px`;
        tbDiv.style.top = `${actualY}px`;
        tbDiv.style.color = finalColor;
        tbDiv.dataset.id = uniqueId;

        // Title/Drag Handle bar
        const handle = document.createElement('div');
        handle.className = 'text-box-handle';
        handle.innerHTML = `<i data-lucide="grip-horizontal" style="width:10px;height:10px;"></i> Texto`;
        tbDiv.appendChild(handle);

        // Delete button
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'text-box-delete';
        deleteBtn.innerHTML = `<i data-lucide="x"></i>`;
        deleteBtn.title = "Excluir";
        tbDiv.appendChild(deleteBtn);

        // Textarea input
        const textarea = document.createElement('textarea');
        textarea.className = 'text-box-textarea';
        textarea.value = text;
        textarea.style.fontSize = finalFontSize;
        textarea.placeholder = "Escreva aqui...";
        tbDiv.appendChild(textarea);

        // Append to overlay
        overlay.appendChild(tbDiv);
        lucide.createIcons({attrs: {class: 'lucide-custom'}});

        // Adjust size initially
        adjustTextarea(textarea);

        // Save metadata to application state array
        const textState = {
            id: uniqueId,
            x: actualX,
            y: actualY,
            xPct: finalXPct,
            yPct: finalYPct,
            text: text,
            color: finalColor,
            fontSize: finalFontSize
        };
        
        // Push state if not already in list
        if (!textBoxes.some(t => t.id === uniqueId)) {
            textBoxes.push(textState);
        }

        // TEXT BOX EVENTS

        // Dragging & Moving Box
        let isMoving = false;

        function startMove(clientX, clientY) {
            if (activeTool !== 'select') return;
            selectTextBox(tbDiv);
            isMoving = true;
            activeTextBoxDrag = tbDiv;
            dragStartX = clientX;
            dragStartY = clientY;
            dragStartLeft = parseFloat(tbDiv.style.left);
            dragStartTop = parseFloat(tbDiv.style.top);
        }

        // Drag handlers on handle or container border
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startMove(e.clientX, e.clientY);
        });

        handle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (e.touches.length > 0) {
                startMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        });

        // Delete button listener
        deleteBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            removeTextBox(uniqueId);
        });

        // Textarea changes
        textarea.addEventListener('input', () => {
            adjustTextarea(textarea);
            const tb = textBoxes.find(t => t.id === uniqueId);
            if (tb) {
                tb.text = textarea.value;
                debouncedBroadcast();
            }
        });

        textarea.addEventListener('blur', () => {
            // If empty, clean it up completely
            if (textarea.value.trim() === "") {
                removeTextBox(uniqueId, false); // silent delete
            } else {
                // Save snap to history
                const tb = textBoxes.find(t => t.id === uniqueId);
                if (tb && tb.text !== text) {
                    tb.text = textarea.value;
                    saveSnapshot();
                }
            }
        });

        textarea.addEventListener('focus', () => {
            selectTextBox(tbDiv);
        });

        // Prevent dragging when typing inside textarea
        textarea.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // Double click to focus textarea in select mode
        tbDiv.addEventListener('dblclick', () => {
            if (isBoardLocked && !isTeacher) {
                showToast("Quadro bloqueado pelo professor!", true);
                return;
            }
            textarea.focus();
        });

        // Clicking container selects it
        tbDiv.addEventListener('mousedown', (e) => {
            if (activeTool === 'select') {
                e.stopPropagation();
                selectTextBox(tbDiv);
            }
        });

        if (focusImmediately) {
            setTimeout(() => {
                selectTextBox(tbDiv);
                textarea.focus();
            }, 50);
        }

        return tbDiv;
    }

    function removeTextBox(id, recordHistory = true) {
        const tbDiv = document.querySelector(`.text-box-container[data-id="${id}"]`);
        if (tbDiv) {
            tbDiv.remove();
        }
        
        textBoxes = textBoxes.filter(t => t.id !== id);
        
        if (selectedTextBox && selectedTextBox.dataset.id === id) {
            selectedTextBox = null;
        }

        if (recordHistory) {
            saveSnapshot();
        } else {
            broadcastCurrentState(); // Sync even if not recording in local undo/redo stack
        }
    }

    function selectTextBox(element) {
        deselectAllTextBoxes();
        selectedTextBox = element;
        selectedTextBox.classList.add('selected');
        
        // Sync toolbar color picker with textbox color if selected
        const id = element.dataset.id;
        const tb = textBoxes.find(t => t.id === id);
        if (tb) {
            activeColor = tb.color;
            activeColorBubble.style.backgroundColor = tb.color;
            customColorInput.value = tb.color;
            
            // Sync font size indicator and slider
            const size = parseInt(tb.fontSize) || 20;
            activeFontSize = size;
            fontSizeIndicator.textContent = size;
            customFontSizeInput.value = size;
            customFontSizeVal.textContent = `${size}px`;
            
            // Highlight active preset
            document.querySelectorAll('.size-preset-btn').forEach(btn => {
                if (parseInt(btn.dataset.size) === size) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        
        // Deselect any selected stroke
        selectedStroke = null;
        redrawAllStrokes();
    }

    function deselectAllTextBoxes() {
        document.querySelectorAll('.text-box-container').forEach(tb => {
            tb.classList.remove('selected');
        });
        selectedTextBox = null;
    }

    // Globals for moving active box
    document.addEventListener('mousemove', (e) => {
        if (activeTextBoxDrag && activeTool === 'select') {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            
            const newX = dragStartLeft + dx;
            const newY = dragStartTop + dy;
            
            activeTextBoxDrag.style.left = `${newX}px`;
            activeTextBoxDrag.style.top = `${newY}px`;
            
            // Update state representation coordinates
            const id = activeTextBoxDrag.dataset.id;
            const tb = textBoxes.find(t => t.id === id);
            if (tb) {
                tb.x = newX;
                tb.y = newY;
                const rect = canvasWrapper.getBoundingClientRect();
                tb.xPct = newX / (rect.width || 1);
                tb.yPct = newY / (rect.height || 1);
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (activeTextBoxDrag) {
            activeTextBoxDrag = null;
            saveSnapshot(); // Save position to history
        }
    });

    // Touch support for dragging text boxes
    document.addEventListener('touchmove', (e) => {
        if (activeTextBoxDrag && activeTool === 'select' && e.touches.length > 0) {
            const touch = e.touches[0];
            const dx = touch.clientX - dragStartX;
            const dy = touch.clientY - dragStartY;
            
            const newX = dragStartLeft + dx;
            const newY = dragStartTop + dy;
            
            activeTextBoxDrag.style.left = `${newX}px`;
            activeTextBoxDrag.style.top = `${newY}px`;
            
            const id = activeTextBoxDrag.dataset.id;
            const tb = textBoxes.find(t => t.id === id);
            if (tb) {
                tb.x = newX;
                tb.y = newY;
                const rect = canvasWrapper.getBoundingClientRect();
                tb.xPct = newX / (rect.width || 1);
                tb.yPct = newY / (rect.height || 1);
            }
        }
    });

    document.addEventListener('touchend', () => {
        if (activeTextBoxDrag) {
            activeTextBoxDrag = null;
            saveSnapshot();
        }
    });


    // UNDO / REDO HISTORY STACK

    function saveState() {
        const rect = canvasWrapper.getBoundingClientRect();
        
        // Deep copy strokes
        const strokesCopy = strokes.map(s => ({
            ...s,
            points: s.points.map(p => ({ ...p }))
        }));
        
        // Deep copy textBoxes list with percentage coordinates
        const textBoxesCopy = textBoxes.map(t => {
            const xPct = t.xPct !== undefined ? t.xPct : (t.x / (rect.width || 1));
            const yPct = t.yPct !== undefined ? t.yPct : (t.y / (rect.height || 1));
            return {
                ...t,
                xPct: xPct,
                yPct: yPct
            };
        });
        
        return {
            strokes: strokesCopy,
            textBoxes: textBoxesCopy
        };
    }

    function restoreState(state, updateRedo = false) {
        if (!state) return;
        
        // Restore strokes
        strokes = state.strokes.map(s => ({
            ...s,
            points: s.points.map(p => ({ ...p }))
        }));
        
        // Restore Text Boxes DOM
        document.querySelectorAll('.text-box-container').forEach(tb => tb.remove());
        
        const rect = canvasWrapper.getBoundingClientRect();
        textBoxes = state.textBoxes.map(t => {
            const x = t.xPct !== undefined ? (t.xPct * rect.width) : t.x;
            const y = t.yPct !== undefined ? (t.yPct * rect.height) : t.y;
            return {
                ...t,
                x: x,
                y: y
            };
        });
        
        textBoxes.forEach(t => {
            createTextBox(t.x, t.y, t.text, false, t.id, t.color, t.fontSize, t.xPct, t.yPct);
        });
        
        scaleStrokesToPixels();
        redrawAllStrokes();
        updateUndoRedoButtons();
    }

    function saveSnapshot() {
        // Save current state and push to undoStack
        const state = saveState();
        undoStack.push(state);
        
        // Limit history depth
        if (undoStack.length > MAX_HISTORY) {
            undoStack.shift();
        }
        
        // Clear redo stack on new action
        redoStack = [];
        updateUndoRedoButtons();
        
        // Sync with Google Meet participants
        broadcastCurrentState();
    }

    // Save initial blank state
    saveSnapshot();

    function triggerUndo() {
        // The last item in undoStack is the CURRENT state, so we need to pop it, save to redo,
        // and restore the previous item.
        if (undoStack.length > 1) {
            const currentState = undoStack.pop();
            redoStack.push(currentState);
            
            const prevState = undoStack[undoStack.length - 1];
            restoreState(prevState);
            showToast("Desfeito!");
        }
    }

    function triggerRedo() {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            undoStack.push(nextState);
            restoreState(nextState);
            showToast("Refeito!");
        }
    }

    function updateUndoRedoButtons() {
        // Since initial state is at index 0, we can undo only if undoStack has > 1 entries
        btnUndo.disabled = undoStack.length <= 1;
        btnRedo.disabled = redoStack.length === 0;
    }

    btnUndo.addEventListener('click', triggerUndo);
    btnRedo.addEventListener('click', triggerRedo);


    // EXTRA ACTIONS

    // Clear board
    btnClear.addEventListener('click', () => {
        if (confirm("Tem certeza que deseja limpar todo o quadro branco?")) {
            strokes = [];
            textBoxes = [];
            selectedStroke = null;
            selectedTextBox = null;
            document.querySelectorAll('.text-box-container').forEach(tb => tb.remove());
            clearCanvasDrawing();
            
            saveSnapshot();
            showToast("Quadro branco limpo!");
        }
    });

    // Toggle Grid
    btnGrid.addEventListener('click', () => {
        canvasWrapper.classList.toggle('dots-grid');
        btnGrid.classList.toggle('active');
        showToast(canvasWrapper.classList.contains('dots-grid') ? "Grade ativada" : "Grade desativada");
    });

    // Theme Toggle (Dark / Light)
    btnTheme.addEventListener('click', () => {
        const isDark = document.body.classList.contains('theme-dark');
        
        if (isDark) {
            document.body.classList.remove('theme-dark');
            document.body.classList.add('theme-light');
            themeIcon.setAttribute('data-lucide', 'sun');
            showToast("Modo Claro ativado");
        } else {
            document.body.classList.remove('theme-light');
            document.body.classList.add('theme-dark');
            themeIcon.setAttribute('data-lucide', 'moon');
            showToast("Modo Escuro ativado");
        }
        
        lucide.createIcons();
        
        // Swap default palette white/black contrast colors depending on theme
        const contrastSwatchIndex = presetColors.indexOf('#f4f4f5'); // Soft white
        const darkContrastSwatchIndex = presetColors.indexOf('#1e293b'); // Charcoal
        
        // Re-align brush preview colors
        updateBrushPreview();
    });

    // Export Canvas as PNG Image
    btnExport.addEventListener('click', () => {
        showToast("Gerando imagem...");

        // Create a temporary canvas that includes the background, grid, and drawings + text boxes!
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const eCtx = exportCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        // Fill background based on active theme (only if not in PDF mode)
        if (!isPdfMode) {
            const isDark = document.body.classList.contains('theme-dark');
            eCtx.fillStyle = isDark ? '#121214' : '#f8fafc';
            eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            
            // Draw grid dots if grid is enabled
            if (canvasWrapper.classList.contains('dots-grid')) {
                const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
                eCtx.fillStyle = gridColor;
                const dotRadius = 1.5 * dpr;
                const spacing = 28 * dpr;
                
                for (let x = spacing / 2; x < exportCanvas.width; x += spacing) {
                    for (let y = spacing / 2; y < exportCanvas.height; y += spacing) {
                        eCtx.beginPath();
                        eCtx.arc(x, y, dotRadius, 0, Math.PI * 2);
                        eCtx.fill();
                    }
                }
            }
        } else {
            // Fill white for PDF backgrounds to ensure they aren't transparent
            eCtx.fillStyle = '#ffffff';
            eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            
            // Draw rendered PDF slide
            eCtx.drawImage(pdfCanvas, 0, 0);
        }
        
        // Copy canvas content (drawings)
        eCtx.drawImage(canvas, 0, 0);
        
        // Render text boxes onto export image
        eCtx.scale(dpr, dpr);
        
        textBoxes.forEach(tb => {
            eCtx.fillStyle = tb.color;
            eCtx.font = `bold ${tb.fontSize || '20px'} 'Outfit', -apple-system, sans-serif`;
            
            // Word wrapping logic for export text
            const words = tb.text.split('\n');
            let currentY = tb.y + 24; // padding for text line height
            
            words.forEach(line => {
                // Since canvas renders text from baseline, adjust positions
                eCtx.fillText(line, tb.x + 8, currentY);
                currentY += 28; // increment line spacing
            });
        });

        // Trigger Download
        setTimeout(() => {
            try {
                const url = exportCanvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = url;
                a.download = isPdfMode ? `craftboard-slide-${currentPdfPage}-${Date.now()}.png` : `craftboard-quadro-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast("Imagem exportada com sucesso!");
            } catch (err) {
                console.error("Export error: ", err);
                showToast("Erro ao exportar imagem", true);
            }
        }, 300);
    });

    // Save current page state helper
    function saveCurrentPageState() {
        if (!isPdfMode) return;
        const rect = canvasWrapper.getBoundingClientRect();
        pageStates[currentPdfPage] = {
            strokes: strokes.map(s => ({
                ...s,
                points: s.points.map(p => ({ ...p }))
            })),
            textBoxes: textBoxes.map(t => {
                const xPct = t.xPct !== undefined ? t.xPct : (t.x / (rect.width || 1));
                const yPct = t.yPct !== undefined ? t.yPct : (t.y / (rect.height || 1));
                return { ...t, xPct, yPct };
            }),
            undoStack: [...undoStack],
            redoStack: [...redoStack]
        };
    }

    // Render specified PDF Page
    function renderPdfPage(pageNum) {
        if (!pdfDoc) return;
        
        pdfDoc.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale: 1 });
            const pdfRatio = viewport.width / viewport.height;
            
            // Size canvasWrapper to fit workspace preserving PDF aspect ratio
            const workspaceRect = workspace.getBoundingClientRect();
            const maxW = workspaceRect.width - 40;
            const maxH = workspaceRect.height - 120; // leave room at bottom for toolbar
            
            let newW = maxW;
            let newH = maxW / pdfRatio;
            
            if (newH > maxH) {
                newH = maxH;
                newW = maxH * pdfRatio;
            }
            
            canvasWrapper.style.width = `${newW}px`;
            canvasWrapper.style.height = `${newH}px`;
            canvasWrapper.style.position = 'relative';
            
            const rect = canvasWrapper.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            
            // Resize Paint Canvas
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Resize PDF Canvas
            pdfCanvas.width = rect.width * dpr;
            pdfCanvas.height = rect.height * dpr;
            const pdfCtx = pdfCanvas.getContext('2d');
            pdfCtx.scale(dpr, dpr);
            
            // Clear both canvases
            pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Render PDF page onto PDF Canvas
            const renderContext = {
                canvasContext: pdfCtx,
                viewport: page.getViewport({ scale: rect.width / viewport.width })
            };
            
            page.render(renderContext).promise.then(() => {
                // Restore drawings and text boxes after render completes
                restorePageStateForPage(pageNum);
            });
            
            // Update UI Controls
            slideIndicator.textContent = `Slide ${pageNum} de ${totalPdfPages}`;
            btnPrevSlide.disabled = pageNum <= 1;
            btnNextSlide.disabled = pageNum >= totalPdfPages;
        });
    }

    // Restore page state drawings and text boxes
    function restorePageStateForPage(pageNum) {
        document.querySelectorAll('.text-box-container').forEach(tb => tb.remove());
        selectedStroke = null;
        
        const rect = canvasWrapper.getBoundingClientRect();
        
        if (pageStates[pageNum]) {
            const state = pageStates[pageNum];
            strokes = state.strokes.map(s => ({
                ...s,
                points: s.points.map(p => ({ ...p }))
            }));
            textBoxes = state.textBoxes.map(t => {
                const x = t.xPct !== undefined ? (t.xPct * rect.width) : t.x;
                const y = t.yPct !== undefined ? (t.yPct * rect.height) : t.y;
                return { ...t, x, y };
            });
            undoStack = [...state.undoStack];
            redoStack = [...state.redoStack];
            
            // Restore text boxes DOM
            textBoxes.forEach(t => {
                createTextBox(t.x, t.y, t.text, false, t.id, t.color, t.fontSize, t.xPct, t.yPct);
            });
            
            scaleStrokesToPixels();
            redrawAllStrokes();
            updateUndoRedoButtons();
        } else {
            strokes = [];
            textBoxes = [];
            undoStack = [];
            redoStack = [];
            
            clearCanvasDrawing();
            saveSnapshot();
        }
    }

    // Handle slide pagination changes
    function changePage(delta) {
        const targetPage = currentPdfPage + delta;
        if (targetPage >= 1 && targetPage <= totalPdfPages) {
            saveCurrentPageState();
            currentPdfPage = targetPage;
            renderPdfPage(currentPdfPage);
            showToast(`Slide ${currentPdfPage}`);
        }
    }

    // Keyboard navigation for presentation mode & object deletion
    document.addEventListener('keydown', (e) => {
        // Don't trigger deletions or pagination if typing inside input/textarea
        if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
            return;
        }
        
        // Deletion shortcut
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedTextBox) {
                const id = selectedTextBox.dataset.id;
                removeTextBox(id);
                showToast("Texto excluído");
            } else if (selectedStroke) {
                strokes = strokes.filter(s => s.id !== selectedStroke.id);
                selectedStroke = null;
                redrawAllStrokes();
                saveSnapshot();
                showToast("Desenho excluído");
            }
        }

        // PDF slide page turning
        if (isPdfMode) {
            if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                e.preventDefault();
                changePage(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                changePage(-1);
            }
        }
    });

    // Toggle font size popover
    fontSizeToolbarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeBrushPopover(); // close color picker popover
        fontSizePopover.classList.toggle('show');
    });

    // Font size custom slider input event
    customFontSizeInput.addEventListener('input', (e) => {
        setBoardFontSize(parseInt(e.target.value));
    });

    // Font size preset buttons click events
    document.querySelectorAll('.size-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setBoardFontSize(parseInt(btn.dataset.size));
            fontSizePopover.classList.remove('show');
        });
    });

    // Helper to set and propagate font size
    function setBoardFontSize(size) {
        activeFontSize = size;
        fontSizeIndicator.textContent = size;
        customFontSizeInput.value = size;
        customFontSizeVal.textContent = `${size}px`;
        
        // Highlight active preset
        document.querySelectorAll('.size-preset-btn').forEach(btn => {
            if (parseInt(btn.dataset.size) === size) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // If a textbox is currently selected, update its size dynamically
        if (selectedTextBox) {
            const textarea = selectedTextBox.querySelector('textarea');
            textarea.style.fontSize = `${size}px`;
            adjustTextarea(textarea);
            
            const id = selectedTextBox.dataset.id;
            const tbState = textBoxes.find(t => t.id === id);
            if (tbState) {
                tbState.fontSize = `${size}px`;
                saveSnapshot();
            }
        }
    }

    // Close selection states if clicking outside the canvas
    document.addEventListener('click', (e) => {
        if (!brushPopover.contains(e.target) && e.target !== colorPreviewBtn) {
            closeBrushPopover();
        }
        if (!fontSizePopover.contains(e.target) && e.target !== fontSizeToolbarBtn) {
            fontSizePopover.classList.remove('show');
        }
        
        // Deselect textbox if clicking empty space
        if (activeTool === 'select' && selectedTextBox && !selectedTextBox.contains(e.target) && !e.target.closest('.controls-panel') && !e.target.closest('.toolbar-floating')) {
            deselectAllTextBoxes();
        }
        
        // Deselect stroke if clicking empty space
        if (activeTool === 'select' && selectedStroke && !canvasWrapper.contains(e.target) && !e.target.closest('.controls-panel') && !e.target.closest('.toolbar-floating')) {
            selectedStroke = null;
            redrawAllStrokes();
        }
    });

    // Button event listeners
    btnPrevSlide.addEventListener('click', () => changePage(-1));
    btnNextSlide.addEventListener('click', () => changePage(1));
    
    // PDF File Load handler
    btnOpenPdf.addEventListener('click', () => {
        pdfFileInput.click();
    });

    pdfFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            showToast("Carregando PDF...");
            const reader = new FileReader();
            reader.onload = function(evt) {
                const arrayBuffer = evt.target.result;
                
                pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(pdf => {
                    // Save standard whiteboard state if not already in PDF mode
                    if (!isPdfMode) {
                        const rect = canvasWrapper.getBoundingClientRect();
                        whiteboardBackupState = {
                            strokes: strokes.map(s => ({
                                ...s,
                                points: s.points.map(p => ({ ...p }))
                            })),
                            textBoxes: textBoxes.map(t => {
                                const xPct = t.xPct !== undefined ? t.xPct : (t.x / (rect.width || 1));
                                const yPct = t.yPct !== undefined ? t.yPct : (t.y / (rect.height || 1));
                                return { ...t, xPct, yPct };
                            }),
                            undoStack: [...undoStack],
                            redoStack: [...redoStack],
                            gridActive: canvasWrapper.classList.contains('dots-grid')
                        };
                    }
                    
                    pdfDoc = pdf;
                    totalPdfPages = pdf.numPages;
                    currentPdfPage = 1;
                    isPdfMode = true;
                    pageStates = {}; // Reset PDF states
                    
                    slideControls.style.display = 'flex';
                    canvasWrapper.classList.remove('dots-grid'); // Hide dots-grid for slides
                    
                    renderPdfPage(currentPdfPage);
                    showToast("PDF carregado! Modo apresentação ativo.");
                    
                    pdfFileInput.value = '';
                }).catch(err => {
                    console.error("Error loading PDF: ", err);
                    showToast("Erro ao carregar o PDF", true);
                });
            };
            reader.readAsArrayBuffer(file);
        } else if (file) {
            showToast("Por favor, selecione um arquivo PDF válido.", true);
        }
    });

    btnClosePdf.addEventListener('click', () => {
        if (confirm("Deseja fechar a apresentação do PDF e voltar ao quadro branco?")) {
            closePdfMode();
        }
    });

    function closePdfMode() {
        pdfDoc = null;
        isPdfMode = false;
        totalPdfPages = 0;
        currentPdfPage = 1;
        pageStates = {};
        selectedStroke = null;
        
        slideControls.style.display = 'none';
        
        canvasWrapper.style.width = '100%';
        canvasWrapper.style.height = '100%';
        canvasWrapper.style.position = 'absolute';
        
        if (whiteboardBackupState && whiteboardBackupState.gridActive) {
            canvasWrapper.classList.add('dots-grid');
        } else {
            canvasWrapper.classList.remove('dots-grid');
        }
        
        initCanvas();
        
        if (whiteboardBackupState) {
            const state = whiteboardBackupState;
            const rect = canvasWrapper.getBoundingClientRect();
            strokes = state.strokes.map(s => ({
                ...s,
                points: s.points.map(p => ({ ...p }))
            }));
            textBoxes = state.textBoxes.map(t => {
                const x = t.xPct * rect.width;
                const y = t.yPct * rect.height;
                return { ...t, x, y };
            });
            undoStack = [...state.undoStack];
            redoStack = [...state.redoStack];
            
            document.querySelectorAll('.text-box-container').forEach(tb => tb.remove());
            textBoxes.forEach(t => {
                createTextBox(t.x, t.y, t.text, false, t.id, t.color, t.fontSize, t.xPct, t.yPct);
            });
            
            scaleStrokesToPixels();
            redrawAllStrokes();
            updateUndoRedoButtons();
            whiteboardBackupState = null;
        } else {
            document.querySelectorAll('.text-box-container').forEach(tb => tb.remove());
            strokes = [];
            textBoxes = [];
            undoStack = [];
            redoStack = [];
            saveSnapshot();
        }
        
        showToast("Voltou ao quadro branco!");
    }

    // Helper functions for vector coordinate scaling, click-detection, and distance formulas
    function scaleStrokesToPixels() {
        const rect = canvasWrapper.getBoundingClientRect();
        strokes.forEach(stroke => {
            stroke.points.forEach(p => {
                p.x = p.xPct * rect.width;
                p.y = p.yPct * rect.height;
            });
        });
    }

    function redrawAllStrokes() {
        clearCanvasDrawing();
        
        strokes.forEach(stroke => {
            if (stroke.points.length === 0) return;
            
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (stroke.tool === 'pencil') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = stroke.color;
                ctx.lineWidth = stroke.thickness;
                ctx.globalAlpha = 1.0;
            } else if (stroke.tool === 'highlighter') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = stroke.color;
                ctx.lineWidth = stroke.thickness;
                ctx.globalAlpha = 0.35;
            } else if (stroke.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = stroke.thickness;
                ctx.globalAlpha = 1.0;
            }
            ctx.stroke();
        });
        
        if (activeTool === 'select' && selectedStroke) {
            drawStrokeHighlight(selectedStroke);
        }
    }

    function drawStrokeHighlight(stroke) {
        if (stroke.points.length === 0) return;
        
        let minX = stroke.points[0].x;
        let maxX = stroke.points[0].x;
        let minY = stroke.points[0].y;
        let maxY = stroke.points[0].y;
        
        stroke.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        
        ctx.save();
        ctx.strokeStyle = '#0ea5e9'; // Cyan
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        
        const pad = 6;
        ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
        
        ctx.fillStyle = '#0ea5e9';
        const sz = 6;
        ctx.fillRect(minX - pad - sz/2, minY - pad - sz/2, sz, sz);
        ctx.fillRect(maxX + pad - sz/2, minY - pad - sz/2, sz, sz);
        ctx.fillRect(minX - pad - sz/2, maxY + pad - sz/2, sz, sz);
        ctx.fillRect(maxX + pad - sz/2, maxY + pad - sz/2, sz, sz);
        
        ctx.restore();
    }

    function findStrokeAt(clickX, clickY) {
        const threshold = 10;
        
        for (let i = strokes.length - 1; i >= 0; i--) {
            const stroke = strokes[i];
            if (stroke.tool === 'eraser') continue;
            
            const pts = stroke.points;
            for (let j = 0; j < pts.length - 1; j++) {
                const p1 = pts[j];
                const p2 = pts[j+1];
                
                const dist = distToSegment({ x: clickX, y: clickY }, p1, p2);
                if (dist <= (stroke.thickness / 2 + threshold)) {
                    return stroke;
                }
            }
        }
        return null;
    }

    function distToSegment(p, v, w) {
        const l2 = dist2(v, w);
        if (l2 === 0) return dist(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return dist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    }

    function dist2(v, w) { return (v.x - w.x) ** 2 + (v.y - w.y) ** 2; }
    function dist(v, w) { return Math.sqrt(dist2(v, w)); }

    // Toast alert presentation helper
    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.className = 'toast';
        if (isError) toast.classList.add('error');
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    // =========================================================================
    // GOOGLE MEET ADD-ON SDK INTEGRATION
    // =========================================================================

    async function initMeetAddon() {
        if (typeof window.meet === 'undefined') {
            console.log("Google Meet Add-on SDK not loaded. Running in standard web mode.");
            return;
        }

        try {
            const addonsApi = window.meet.addons || window.meet.addon;
            if (!addonsApi) {
                console.log("Add-ons API not present in SDK. Running in standard web mode.");
                return;
            }

            meetSession = await addonsApi.createAddonSession({
                cloudProjectNumber: "159749600102"
            });
            console.log("Google Meet Add-on Session created.");
            showToast("Conectado ao Google Meet!");

            const myDelegate = {
                onCoDoingStateChanged: (newState) => {
                    if (isBroadcasting) return; // Ignore echo back of own broadcasts
                    
                    try {
                        const decoder = new TextDecoder();
                        const stateString = decoder.decode(newState);
                        const state = JSON.parse(stateString);
                        
                        console.log("Meet State received: ", state);
                        applyMeetState(state);
                    } catch (err) {
                        console.error("Error decoding Meet sync state:", err);
                    }
                }
            };

            coDoingClient = await meetSession.createCoDoingClient(myDelegate);
            console.log("Meet Co-Doing client successfully initialized.");
        } catch (e) {
            console.warn("Could not create Meet Add-on Session (standard web mode).", e);
        }
    }

    function broadcastCurrentState() {
        if (!coDoingClient || isBroadcasting) return;
        
        try {
            const state = {
                isPdfMode: isPdfMode,
                pdfName: pdfDoc ? (pdfFileInput.files[0] ? pdfFileInput.files[0].name : "Apresentação") : null,
                currentPdfPage: currentPdfPage,
                totalPdfPages: totalPdfPages,
                pageStates: pageStates,
                strokes: strokes,
                textBoxes: textBoxes,
                undoStack: undoStack,
                redoStack: redoStack,
                isBoardLocked: isBoardLocked
            };
            
            const encoder = new TextEncoder();
            const stateData = encoder.encode(JSON.stringify(state));
            
            // Check size limits
            if (stateData.length > 60000) {
                console.warn("whiteboard state is too large to broadcast (>60KB).");
                return;
            }
            
            coDoingClient.broadcastState(stateData);
            console.log("Whiteboard state shared with Meet participants.");
        } catch (err) {
            console.error("Error sharing state with Meet:", err);
        }
    }

    function debouncedBroadcast() {
        clearTimeout(broadcastTimeout);
        broadcastTimeout = setTimeout(broadcastCurrentState, 500);
    }

    function applyMeetState(state) {
        isBroadcasting = true;
        
        try {
            // Since we are applying a remote state, we are a student participant!
            isTeacher = false;
            btnLockBoard.disabled = true; // disable lock toggle for students
            btnLockBoard.title = "Quadro bloqueado pelo professor";
            
            if (state.isBoardLocked !== undefined) {
                isBoardLocked = state.isBoardLocked;
                updateLockUI();
            }

            if (state.isPdfMode) {
                // If remote entered PDF mode, match it
                isPdfMode = true;
                currentPdfPage = state.currentPdfPage;
                totalPdfPages = state.totalPdfPages;
                pageStates = state.pageStates;
                
                slideControls.style.display = 'flex';
                canvasWrapper.classList.remove('dots-grid');
                
                if (pdfDoc) {
                    renderPdfPage(currentPdfPage);
                } else {
                    showToast(`Slide remoto: ${currentPdfPage}. Por favor, carregue o PDF: "${state.pdfName || 'Apresentação'}"`);
                    restorePageStateForPage(currentPdfPage);
                }
            } else {
                if (isPdfMode) {
                    // Close PDF mode if remote closed it
                    pdfDoc = null;
                    isPdfMode = false;
                    totalPdfPages = 0;
                    currentPdfPage = 1;
                    pageStates = {};
                    slideControls.style.display = 'none';
                    canvasWrapper.style.width = '100%';
                    canvasWrapper.style.height = '100%';
                    canvasWrapper.style.position = 'absolute';
                    canvasWrapper.classList.add('dots-grid');
                    initCanvas();
                }
                
                strokes = state.strokes || [];
                textBoxes = state.textBoxes || [];
                undoStack = state.undoStack || [];
                redoStack = state.redoStack || [];
                
                // Repopulate text boxes DOM
                document.querySelectorAll('.text-box-container').forEach(tb => tb.remove());
                textBoxes.forEach(t => {
                    createTextBox(t.x, t.y, t.text, false, t.id, t.color, t.fontSize, t.xPct, t.yPct);
                });
                
                scaleStrokesToPixels();
                redrawAllStrokes();
                updateUndoRedoButtons();
            }
        } catch (err) {
            console.error("Failed to apply Google Meet state:", err);
        } finally {
            isBroadcasting = false;
        }
    }

    // Lock/Unlock Board click event
    btnLockBoard.addEventListener('click', () => {
        if (!isTeacher) {
            showToast("Apenas o professor pode alterar o bloqueio do quadro!", true);
            return;
        }
        
        isBoardLocked = !isBoardLocked;
        updateLockUI();
        
        // Sync update with other participants in Google Meet
        broadcastCurrentState();
    });

    function updateLockUI() {
        if (isBoardLocked) {
            lockIcon.setAttribute('data-lucide', 'lock');
            btnLockBoard.title = "Desbloquear Edição dos Alunos";
            btnLockBoard.classList.add('btn-danger-text');
            showToast("Quadro bloqueado para alunos!");
            
            // If local user is a student, force them to select tool
            if (!isTeacher) {
                selectTool('select');
            }
        } else {
            lockIcon.setAttribute('data-lucide', 'unlock');
            btnLockBoard.title = "Bloquear Edição dos Alunos";
            btnLockBoard.classList.remove('btn-danger-text');
            showToast("Quadro desbloqueado para todos!");
        }
        // Refresh icons since we modified data-lucide attribute
        lucide.createIcons();
    }

    // Initialize Meet SDK
    initMeetAddon();
});
