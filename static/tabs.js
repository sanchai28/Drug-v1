// tabs.js

/**
 * Sets the active tab and loads its content.
 * @param {string} tabId - The ID of the tab to activate.
 */
function setActiveTab(tabId) {
    const contents = document.querySelectorAll('.tab-content');
    const tabs = document.querySelectorAll('.tab-link');
    const defaultTab = 'dashboard'; // Default tab if provided tabId is invalid

    if (!tabId || !document.getElementById(tabId)) { 
        console.warn(`Tab ID "${tabId}" not found, defaulting to "${defaultTab}".`);
        tabId = defaultTab;
    }

    contents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) {
            content.classList.add('active');
            // Ensure loadDataForTab is called after the tab content is made visible
            // This might be better handled if loadDataForTab itself checks for visibility or if
            // the 'active' class reliably makes it visible before this call.
            if (typeof loadDataForTab === 'function') {
                loadDataForTab(tabId); 
            } else {
                console.warn('loadDataForTab function is not defined. Data for active tab might not load.');
            }
        }
    });

    tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        }
    });

    localStorage.setItem('activeInventoryTabSHPH', tabId); // Using a specific key for this app
}

/**
 * Initializes tab functionality on DOMContentLoaded.
 * Sets up event listeners for tab links and loads the initial active tab.
 */
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab-link');
    const activeTabKey = 'activeInventoryTabSHPH';
    const defaultTab = 'dashboard';

    tabs.forEach(tab => {
        tab.addEventListener('click', function (event) {
            event.preventDefault();
            const tabId = this.dataset.tab;
            setActiveTab(tabId);
        });
    });

    const savedTab = localStorage.getItem(activeTabKey);
    const initialTabId = document.getElementById(savedTab) ? savedTab : defaultTab;
    
    // Ensure the initial tab content is displayed before trying to load data for it.
    // This might require a slight delay or ensuring CSS makes it immediately visible.
    const initialTabElement = document.getElementById(initialTabId);
    if (initialTabElement) {
        // First, make sure all other tabs are inactive and the target tab is active in terms of class
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        initialTabElement.classList.add('active');
        
        document.querySelectorAll('.tab-link').forEach(tl => tl.classList.remove('active'));
        const initialTabLink = document.querySelector(`.tab-link[data-tab="${initialTabId}"]`);
        if (initialTabLink) {
            initialTabLink.classList.add('active');
        }
        
        // Then call setActiveTab which will also call loadDataForTab
        setActiveTab(initialTabId);
    } else {
        // Fallback if even default tab element is not found (should not happen in current HTML)
        setActiveTab(defaultTab);
    }
}

// Initialize tabs when the DOM is fully loaded.
// This should be called from your main script file (e.g., main.js or script.js)
// after all other necessary functions (like loadDataForTab) are defined,
// or ensure loadDataForTab is defined before this.
// For now, we assume it will be called from a main script.
// Example:
// document.addEventListener('DOMContentLoaded', initializeTabs);