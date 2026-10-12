// src/content/prompt-library.js
// Feature A: Prompt Library
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  
  function generateId() {
    return Math.random().toString(36).substring(2, 9);
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openLibrary() {
    const { h, closeOverlay, toast } = NS.ui;
    
    let prompts = [];
    let listContainer = null;
    let searchQuery = '';

    const renderList = () => {
      listContainer.innerHTML = '';
      
      const filtered = prompts.filter(p => 
        (p.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (p.tags || []).join(' ').toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (filtered.length === 0) {
        listContainer.append(h('div', { class: 'nblm-empty', text: '没有找到提示词' }));
        return;
      }

      filtered.forEach(p => {
        const item = h('div', { class: 'nblm-list-item', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('div', { style: { flex: '1', minWidth: 0, marginRight: '10px' } },
            h('div', { class: 't', text: p.title || '无标题' }),
            h('div', { class: 'm nblm-chips', style: { marginBottom: '8px' } }, ...(p.tags || []).map(t => h('span', { class: 'nblm-chip', style: { padding: '2px 8px', fontSize: '11px' }, text: t }))),
            h('div', { class: 'm', text: p.body.substring(0, 60) + (p.body.length > 60 ? '...' : '') })
          ),
          h('div', { style: { display: 'flex', gap: '8px', flexDirection: 'column' } },
            h('div', { style: { display: 'flex', gap: '4px' } },
              h('button', { class: 'nblm-btn primary', text: '填入', onClick: () => {
                const input = NS.dom.getChatInput();
                if (input) {
                  NS.dom.setInputValue(input, p.body);
                  toast('已填入对话框');
                  closeOverlay();
                } else {
                  toast('未找到对话框');
                }
              }}),
              h('button', { class: 'nblm-btn', text: '复制', onClick: async () => {
                try {
                  await navigator.clipboard.writeText(p.body);
                  toast('已复制到剪贴板');
                } catch (e) { toast('复制失败'); }
              }})
            ),
            h('button', { class: 'nblm-btn', text: '编辑', onClick: () => openEditor(p) })
          )
        );
        listContainer.append(item);
      });
    };

    const loadPrompts = async () => {
      prompts = await NS.storage.getPrompts();
      renderList();
    };

    const savePrompts = async () => {
      await NS.storage.setPrompts(prompts);
      renderList();
    };

    const openEditor = (promptItem) => {
      const isNew = !promptItem;
      const data = promptItem || { id: generateId(), title: '', tags: [], body: '' };
      
      const titleInput = h('input', { class: 'nblm-input', type: 'text', placeholder: '提示词标题', value: data.title });
      const tagsInput = h('input', { class: 'nblm-input', type: 'text', placeholder: '标签 (用逗号分隔)', value: data.tags.join(', ') });
      const bodyInput = h('textarea', { class: 'nblm-textarea', placeholder: '提示词内容...', value: data.body });

      const form = h('div', { class: 'nblm-row' },
        h('label', { class: 'nblm-label', text: '标题' }), titleInput, h('br'),
        h('label', { class: 'nblm-label', text: '标签' }), tagsInput, h('br'),
        h('label', { class: 'nblm-label', text: '内容' }), bodyInput
      );

      const footer = [
        !isNew ? h('button', { class: 'nblm-btn', style: { color: 'red' }, text: '删除', onClick: async () => {
          if (confirm('确定删除此提示词吗？')) {
            prompts = prompts.filter(p => p.id !== data.id);
            await savePrompts();
            toast('已删除');
            NS.ui.closeOverlay();
            openLibrary(); // Reopen library
          }
        }}) : null,
        h('button', { class: 'nblm-btn', text: '取消', onClick: () => {
          NS.ui.closeOverlay();
          openLibrary(); // Reopen library
        }}),
        h('button', { class: 'nblm-btn primary', text: '保存', onClick: async () => {
          try {
            data.title = titleInput.value.trim();
            data.tags = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
            data.body = bodyInput.value.trim();
            if (!data.body) return toast('内容不能为空');
            
            if (isNew) {
              data.createdAt = Date.now();
              prompts.unshift(data);
            } else {
              const idx = prompts.findIndex(p => p.id === data.id);
              if (idx > -1) prompts[idx] = data;
            }
            await savePrompts();
            toast('保存成功');
            NS.ui.closeOverlay();
            openLibrary(); // Reopen library
          } catch (e) {
            toast('保存失败: ' + e.message);
          }
        }})
      ];

      NS.ui.openOverlay(form, { title: isNew ? '新增提示词' : '编辑提示词', footer });
    };

    const searchInput = h('input', { 
      class: 'nblm-input', 
      type: 'text', 
      placeholder: '搜索提示词...',
      onInput: (e) => {
        searchQuery = e.target.value;
        renderList();
      }
    });

    listContainer = h('div', { style: { marginTop: '16px', maxHeight: '400px', overflowY: 'auto' } });

    const fileInput = h('input', { type: 'file', accept: '.json', style: { display: 'none' }, onChange: (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (!Array.isArray(imported)) throw new Error('无效的 JSON 格式');
          
          const existingIds = new Set(prompts.map(p => p.id));
          let count = 0;
          imported.forEach(p => {
            if (p.id && p.body && !existingIds.has(p.id)) {
              prompts.push(p);
              existingIds.add(p.id);
              count++;
            }
          });
          
          if (count > 0) {
            await savePrompts();
            toast(`成功导入 ${count} 条提示词`);
          } else {
            toast('没有导入任何新提示词');
          }
        } catch (err) {
          toast('导入失败: ' + err.message);
        }
      };
      reader.readAsText(file);
    }});

    const topBar = h('div', { style: { display: 'flex', gap: '8px' } }, searchInput, h('button', { class: 'nblm-btn primary', text: '+ 新增', onClick: () => openEditor() }));

    const body = h('div', null, topBar, listContainer, fileInput);

    const footer = [
      h('button', { class: 'nblm-btn', text: '📥 导入 JSON', onClick: () => fileInput.click() }),
      h('button', { class: 'nblm-btn', text: '📤 导出 JSON', onClick: () => {
        if (!prompts.length) return toast('暂无提示词可导出');
        downloadJson(prompts, `notebooklm_prompts_${Date.now()}.json`);
      }})
    ];

    NS.ui.openOverlay(body, { title: '📚 Prompt 库', footer });
    loadPrompts();
  }

  NS.promptLibrary = { open: openLibrary };
})();
