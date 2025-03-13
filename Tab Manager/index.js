/*
Enviar mensajes entre el popup y el content script

  await chrome.scripting.executeScript({
    target: { tabId: tabData.id },
    func: (tab) => { console.log("Dentro del tab:", tab); },
    args: [tabData]
  });
*/

const addTabEl = document.getElementById('add-tab');
const addCategoryEl = document.getElementById('add-category');
const tabsEl = document.getElementById('tabs');
let isAddingCategory = false;

const rightArrowSvg = `<path fill="currentColor" d="m13.172 12l-4.95-4.95l1.414-1.413L16 12l-6.364 6.364l-1.414-1.415z"/>`
const downArrowSvg = `<path fill="currentColor" d="m12 13.171l4.95-4.95l1.414 1.415L12 16L5.636 9.636L7.05 8.222z"/>`
let tabs = {};
let lastId = -1;

function buildCategoryTab(category) {
    let categoryTab = document.createElement('div');
    categoryTab.classList.add('category-tab');
    categoryTab.id = category;

    categoryTab.addEventListener('dragover', (event) => {
        event.preventDefault();
    });

    categoryTab.addEventListener('drop', (event) => {
        event.preventDefault();
        console.log('drop en category-tab:', category);
        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.sourceCategory === category) return;
            handleTabDrop(data, category);
        } catch (e) {
            console.error("Error al procesar el drop en category-tab", e);
        }
    });

    // Header de la categoría
    let categoryHeader = document.createElement('div');
    categoryHeader.classList.add('category-header');

    let categoryTitle = document.createElement('h2');
    categoryTitle.textContent = category;
    categoryHeader.appendChild(categoryTitle);

    // Crear el icono con SVG usando createElementNS
    let arrowSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrowSvg.setAttribute("width", "24");
    arrowSvg.setAttribute("height", "24");
    arrowSvg.setAttribute("viewBox", "0 0 24 24");
    arrowSvg.innerHTML = rightArrowSvg;
    categoryHeader.appendChild(arrowSvg);

    categoryHeader.addEventListener('click', () => {
        let body = categoryTab.getElementsByClassName('category-body')[0];
        let expanded = body.getAttribute('aria-expanded') === "true";
        body.setAttribute('aria-expanded', !expanded);
        arrowSvg.innerHTML = !expanded ? downArrowSvg : rightArrowSvg;
    });

    // Body donde se añadirán los tabs
    let categoryBody = document.createElement('div');
    categoryBody.classList.add('category-body');
    categoryBody.setAttribute('aria-expanded', "false");

    // Agregar header y body al contenedor principal
    categoryTab.appendChild(categoryHeader);
    categoryTab.appendChild(categoryBody);

    return categoryTab;
}

function buildTab(categoryEl, tabInfo) {
    let tabElement = document.createElement('div');
    tabElement.classList.add('tab');
    tabElement.dataset.internalid = tabInfo.internalId;
    tabElement.dataset.category = categoryEl.id;
    tabElement.setAttribute('draggable', 'true');

    // Configurar evento dragstart
    tabElement.addEventListener('dragstart', (event) => {
        console.log("Drag start")
        const data = {
            internalId: tabInfo.internalId,
            sourceCategory: categoryEl.id
        };
        event.dataTransfer.setData('text/plain', JSON.stringify(data));
    });

    // Renderizar el contenido del tab
    let tabAnchorElement = document.createElement('a');
    tabAnchorElement.href = tabInfo.url;
    tabAnchorElement.target = '_blank';
    tabAnchorElement.classList.add('tab-link');

    let favicon = document.createElement('img');
    favicon.src = tabInfo.faviconUrl;
    favicon.alt = tabInfo.title;
    tabAnchorElement.appendChild(favicon);

    let title = document.createElement('span');
    title.textContent = tabInfo.title;
    tabAnchorElement.appendChild(title);

    let deleteButton = document.createElement('button');
    deleteButton.classList.add('delete-tab');
    deleteButton.type = 'button';
    deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M17 6h5v2h-2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8H2V6h5V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1zm1 2H6v12h12zM9 4v2h6V4z"/></svg>';
    deleteButton.setAttribute('data-category', categoryEl.id);
    deleteButton.addEventListener('click', () => deleteTab(categoryEl.id, tabInfo.internalId));

    tabElement.appendChild(tabAnchorElement);
    tabElement.appendChild(deleteButton);

    // Agregar el tab al body de la categoría
    categoryEl.getElementsByClassName('category-body')[0].appendChild(tabElement);
}

async function handleTabDrop(data, newCategory) {
    const { internalId, sourceCategory } = data;
    // Buscar el tab en la categoría de origen en el objeto global "tabs"
    const tabIndex = tabs[sourceCategory].findIndex(t => t.internalId === internalId);
    if (tabIndex === -1) return; // No se encontró

    // Extraer la información del tab
    const [tabData] = tabs[sourceCategory].splice(tabIndex, 1);
    // Agregar el tab a la nueva categoría (asumiendo que la categoría ya existe)
    if (!tabs[newCategory]) {
        // Si no existe la categoría, se puede crear o rechazar la acción.
        console.error("La categoría destino no existe");
        return;
    }
    tabs[newCategory].push(tabData);

    // Actualizar chrome.storage.local
    await chrome.storage.local.set({ lastId: lastId, tabs: tabs });

    // Mover el elemento del DOM
    const tabElement = document.querySelector(`div.tab[data-internalid="${internalId}"]`);
    if (tabElement) {
        // Actualizar el atributo data-category
        tabElement.dataset.category = newCategory;
        // Buscar el contenedor del nuevo grupo (category-body)
        const newCategoryBody = document.getElementById(newCategory).querySelector('.category-body');
        if (newCategoryBody) {
            newCategoryBody.appendChild(tabElement);
        }
    }
}

async function deleteTab(category, internalId) {
    let allTabs = await chrome.storage.local.get("tabs");
    allTabs.tabs[category] = allTabs.tabs[category].filter(t => t.internalId !== internalId);
    await chrome.storage.local.set({ lastId: lastId, tabs: allTabs.tabs });
    document.querySelector(`div[data-internalid="${internalId}"]`).remove();
}

function render() {
    console.log(tabs)
    for (let tabCat in tabs) {
        console.log(tabCat)
        let categoryTab = buildCategoryTab(tabCat);
        for (let tab of tabs[tabCat]) {
            buildTab(categoryTab, tab);
        }
        tabsEl.appendChild(categoryTab);
    }
}

async function init() {
    // Add event listeners
    addTabEl.addEventListener('click', handleAddTab);
    addCategoryEl.addEventListener('click', handleAddCategory);
    document.getElementById('confirm-add-category').addEventListener('click', addCategory);
    document.getElementById('cancel-add-category').addEventListener('click', () => {
        isAddingCategory = false;
        document.getElementById('add-category-input').value = '';
        document.getElementById('add-category-container').setAttribute('aria-hidden', true);
    });
    // Revisamos el storage
    const existsData = await chrome.storage.local.get("tabs");
    if (Object.keys(existsData).length === 0) {
        await chrome.storage.local.set({ lastId: 0, tabs: { all: [] } });
    }
    const data = await chrome.storage.local.get("tabs");
    const _lastId = await chrome.storage.local.get("lastId");
    tabs = data.tabs;
    lastId = _lastId.lastId;
    render();
}

function handleAddCategory() {
    if (!isAddingCategory) {
        isAddingCategory = true;
        document.getElementById('add-category-container').setAttribute('aria-hidden', false);
    } else {
        isAddingCategory = false;
        document.getElementById('add-category-input').value = '';
        document.getElementById('add-category-container').setAttribute('aria-hidden', true);
    }
}

async function addCategory() {
    const category = document.getElementById('add-category-input').value;
    if (category.length === 0) {
        return;
    }
    await chrome.storage.local.get("tabs", async (data) => {
        let _d = data;
        _d.tabs[category] = [];
        await chrome.storage.local.set({ lastId: lastId, tabs: _d.tabs});
    });
    tabs[category] = [];
    // Renderizamos la categoria
    let categoryTab = buildCategoryTab(category);
    tabsEl.appendChild(categoryTab);
    // Limpiamos el input
    document.getElementById('add-category-input').value = '';
    // Ocultamos el input
    document.getElementById('add-category-container').setAttribute('aria-hidden', true);
    isAddingCategory = false;
}

async function handleAddTab() {
    const _tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    let activeTab = _tabs[0];
    const tabData = { 
      url: activeTab.url, 
      faviconUrl: activeTab.favIconUrl, 
      title: activeTab.title,
      internalId: lastId,
    };
    // Obtenemos los tabs
    lastId += 1;
    tabs.all.push(tabData);
    await chrome.storage.local.get("tabs", async (data) => {
        let _d = data;
        _d.tabs.all.push(tabData);
        await chrome.storage.local.set({ lastId: lastId, tabs: _d.tabs});
    }); 
    // Renderizamos unicamente el Tab.
    buildTab(document.getElementById('all'), tabData);
}

init();