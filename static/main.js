// main.js

// --- Global Variable for Logged-in User ---
// This will be populated by checkLoginStatus() from localStorage
let currentUser = null; 

// --- DOMContentLoaded: Initial Setup ---
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM fully loaded and parsed. Initializing application...");

    // 1. Check login status and set up UI based on user role
    checkLoginStatus(); // This will set currentUser and update tab visibility

    // 2. Initialize tab functionality 
    // (Assumes initializeTabs is defined in tabs.js and will call setActiveTab, 
    // which in turn should call loadDataForTab defined in this file for the initial tab)
    if (typeof initializeTabs === 'function') {
        initializeTabs(); 
    } else {
        console.error("initializeTabs function is not defined. Tab system will not work correctly.");
    }

    // 3. Event delegation for auto-formatting date inputs
    document.addEventListener('input', function(event) {
        if (event.target.classList.contains('thai-date-formatter')) {
            if (typeof autoFormatThaiDateInput === 'function') { // autoFormatThaiDateInput should be in utils.js
                autoFormatThaiDateInput(event);
            } else {
                console.error("autoFormatThaiDateInput function is not defined.");
            }
        }
    });

    // 4. Set default fiscal year dates for filters
    if (typeof getFiscalYearRange === 'function') { // getFiscalYearRange should be in utils.js
        const fiscalYear = getFiscalYearRange();
        const dateFilterConfigs = [
            { startId: 'startDateReq', endId: 'endDateReq' },
            { startId: 'startDateApprv', endId: 'endDateApprv' },
            { startId: 'startDateRecv', endId: 'endDateRecv' },
            { startId: 'startDateDisp', endId: 'endDateDisp' }
        ];

        dateFilterConfigs.forEach(config => {
            const startDateInput = document.getElementById(config.startId);
            const endDateInput = document.getElementById(config.endId);
            if (startDateInput) startDateInput.value = fiscalYear.startDate;
            if (endDateInput) endDateInput.value = fiscalYear.endDate;
        });
    } else {
        console.error("getFiscalYearRange function is not defined. Date filters will not have default fiscal year values.");
    }
    
    // 5. Global click listener to close suggestion boxes when clicking outside
    document.addEventListener('click', function(event) {
        const openSuggestionBoxes = document.querySelectorAll('.suggestions-box');
        openSuggestionBoxes.forEach(box => {
            let isClickOnSearchInput = false;
            const searchInput = box.closest('.relative')?.querySelector('.medicine-search-input'); 

            if (searchInput && searchInput === event.target) {
                isClickOnSearchInput = true;
            }
            
            if (!box.contains(event.target) && !isClickOnSearchInput) {
                box.innerHTML = '';
                box.classList.add('hidden');
            }
        });
    });

    console.log("Application frontend initialized.");
});

// --- Authentication and Role Management ---
/**
 * Checks login status from localStorage, updates UI, and manages tab visibility.
 * Redirects to login.html if not logged in and not already on login page.
 */
function checkLoginStatus() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser); 
        console.log("User logged in:", currentUser);
        const currentUserDisplay = document.getElementById('currentUser');
        if (currentUserDisplay) {
            currentUserDisplay.textContent = `${currentUser.full_name || currentUser.username} (${currentUser.role} - ${currentUser.hcode || 'N/A'})`;
        }
        
        if (typeof updateTabVisibility === 'function') { 
            updateTabVisibility(currentUser.role);
        } else {
            console.error("updateTabVisibility function is not defined in main.js or tabs.js. Tab visibility may not be correct.");
        }
    } else {
        console.log("No user logged in, redirecting to login page.");
        const currentPage = window.location.pathname.substring(window.location.pathname.lastIndexOf("/") + 1);
        if (currentPage !== '/login' && currentPage !== '') { // Avoid redirect loop if already on login.html or root (which might be index.html)
             // Check if it's index.html trying to load without user, then redirect
            if (currentPage === '/index' || currentPage === '') { // Assuming index.html is the main page
                 window.location.href = '/login';
            }
        } else if (currentPage === '' && !storedUser) { // Specifically for root path when no user
             window.location.href = '/login';
        }
    }
}

/**
 * Updates tab visibility based on user role.
 * This function should be defined here if not in tabs.js
 * @param {string} userRole - The role of the logged-in user.
 */
function updateTabVisibility(userRole) {
    console.log("Updating tab visibility for role:", userRole);
    const allTabLiElements = document.querySelectorAll('nav ul li'); 

    const rolePermissions = {
        'ผู้ดูแลระบบ': ['dashboard', 'medicineMaster', 'inventoryManagement', 'requisitionManagement', 'requisitionApproval', 'goodsReceiving', 'dispenseMedicine', 'unitServiceManagement', 'admin'],
        'เจ้าหน้าที่ รพสต.': ['dashboard', 'medicineMaster', 'inventoryManagement', 'requisitionManagement', 'goodsReceiving', 'dispenseMedicine'],
        'เจ้าหน้าที่ รพ. แม่ข่าย': ['requisitionApproval', 'dashboard'] 
    };

    const allowedTabs = rolePermissions[userRole] || [];
    console.log("Allowed tabs for role:", userRole, allowedTabs);

    let firstAllowedAndVisibleTab = null;

    allTabLiElements.forEach(liElement => {
        const tabLink = liElement.querySelector('a.tab-link');
        if (tabLink) {
            const tabKey = tabLink.dataset.tab;
            if (allowedTabs.includes(tabKey)) {
                liElement.style.display = ''; 
                if (!firstAllowedAndVisibleTab) {
                    firstAllowedAndVisibleTab = tabKey; 
                }
            } else {
                liElement.style.display = 'none'; 
            }
        }
    });

    // This part should be handled by initializeTabs in tabs.js after visibility is set
    // initializeTabs will call setActiveTab with the stored or default tab.
    // setActiveTab (in tabs.js) should then check if the target tab is visible.
    // If not, it should select the firstAllowedAndVisibleTab.

    // For now, let's ensure the logic to find a fallback is here if setActiveTab doesn't handle it
    const activeTabKey = 'activeInventoryTabSHPH';
    let currentActiveTabId = localStorage.getItem(activeTabKey);
    let currentActiveTabLinkElement = currentActiveTabId ? document.querySelector(`.tab-link[data-tab="${currentActiveTabId}"]`) : null;
    
    if (!currentActiveTabId || !currentActiveTabLinkElement || (currentActiveTabLinkElement && currentActiveTabLinkElement.parentElement.style.display === 'none')) {
        const newActiveTab = firstAllowedAndVisibleTab || 'dashboard'; 
        console.log("Current active tab is hidden or invalid, attempting to switch to:", newActiveTab);
        if (typeof setActiveTab === 'function') { 
            setActiveTab(newActiveTab); // This will trigger loadDataForTab
        }
    } else if (currentActiveTabId && typeof setActiveTab === 'function' && currentActiveTabLinkElement.parentElement.style.display !== 'none') {
        // If the current active tab is valid and visible, ensure it's set (this also triggers loadDataForTab)
        setActiveTab(currentActiveTabId);
    }
}


/**
 * Handles user logout.
 */
async function logout() { 
    Swal.fire({
        title: 'ออกจากระบบ',
        text: 'คุณต้องการออกจากระบบใช่หรือไม่?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => { 
        if (result.isConfirmed) {
            localStorage.removeItem('currentUser');
            currentUser = null;
            // TODO: Call backend logout API if implemented 
            // try {
            //     if (typeof fetchData === 'function') await fetchData('/logout', { method: 'POST' });
            // } catch (error) {
            //     console.error("Logout API call failed:", error);
            // }
            Swal.fire('ออกจากระบบแล้ว', '', 'success').then(() => {
                window.location.href = '/login';
            });
        }
    });
}

/**
 * Fetches and displays dashboard summary data.
 */
async function loadDashboardSummary() {
    console.log("Loading dashboard summary...");
    const totalMedicinesEl = document.getElementById('dashboardTotalMedicines');
    const lowStockEl = document.getElementById('dashboardLowStock');
    const pendingRequisitionsEl = document.getElementById('dashboardPendingRequisitions');

    if (!totalMedicinesEl || !lowStockEl || !pendingRequisitionsEl) {
        console.error("Dashboard summary elements not found in HTML.");
        return;
    }

    // ตั้งค่าเริ่มต้น
    totalMedicinesEl.innerHTML = '- <span class="text-sm">รายการ</span>';
    lowStockEl.innerHTML = '- <span class="text-sm">รายการ</span>';
    pendingRequisitionsEl.innerHTML = '- <span class="text-sm">รายการ</span>';

    if (!currentUser) {
        console.warn("Cannot load dashboard summary: currentUser is not defined.");
        // อาจแสดงข้อความว่า "กรุณา login" ใน dashboard elements
        return;
    }

    let queryParams = '';
    if (currentUser.hcode) {
        queryParams = `?hcode=${currentUser.hcode}&role=${currentUser.role}`;
    } else if (currentUser.role === 'ผู้ดูแลระบบ') {
        queryParams = `?role=${currentUser.role}`; // Admin อาจจะไม่ต้องส่ง hcode
    } else {
        // กรณีอื่นๆ ที่ไม่มี hcode และไม่ใช่ Admin อาจจะไม่สามารถโหลดข้อมูลได้
        console.warn("Dashboard summary: Hcode not available for this user role.");
        totalMedicinesEl.textContent = 'N/A';
        lowStockEl.textContent = 'N/A';
        pendingRequisitionsEl.textContent = 'N/A';
        return;
    }

    try {
        // fetchData ควรมาจาก utils.js
        const summary = await fetchData(`/dashboard/summary${queryParams}`);
        
        if (summary) {
            totalMedicinesEl.innerHTML = `${summary.total_medicines_in_stock || 0} <span class="text-sm">รายการ</span>`;
            lowStockEl.innerHTML = `${summary.low_stock_medicines || 0} <span class="text-sm">รายการ</span>`;
            pendingRequisitionsEl.innerHTML = `${summary.pending_requisitions || 0} <span class="text-sm">รายการ</span>`;
        } else {
            console.warn("Dashboard summary data is null or undefined.");
        }
    } catch (error) {
        console.error("Error loading dashboard summary:", error);
        totalMedicinesEl.textContent = 'Error';
        lowStockEl.textContent = 'Error';
        pendingRequisitionsEl.textContent = 'Error';
        // Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลสรุป Dashboard ได้', 'error'); // fetchData น่าจะแสดง error แล้ว
    }
}
// --- Data Loading Router ---
/**
 * Loads data for the currently active tab based on its ID.
 * Relies on the global `currentUser` object.
 * @param {string} tabId - The ID of the active tab.
 */
async function loadDataForTab(tabId) {
    console.log(`Main: Loading data for tab: ${tabId}`);
    
    if (!currentUser && window.location.pathname.indexOf('/login') === -1) {
        console.warn("User not logged in, skipping data load for tab:", tabId);
        return; 
    }

    await new Promise(resolve => setTimeout(resolve, 50)); 

    switch (tabId) {
        case 'dashboard':
            await loadDashboardSummary();
            break;
        case 'medicineMaster':
            if (typeof loadAndDisplayMedicines === 'function') await loadAndDisplayMedicines();
            else console.error("loadAndDisplayMedicines function not found.");
            break;
        case 'inventoryManagement':
            if (typeof loadAndDisplayInventorySummary === 'function') await loadAndDisplayInventorySummary();
            else console.error("loadAndDisplayInventorySummary function not found.");
            break;
        case 'requisitionManagement':
            if (typeof loadAndDisplayRequisitions === 'function') await loadAndDisplayRequisitions();
            else console.error("loadAndDisplayRequisitions function not found.");
            break;
        case 'requisitionApproval':
            if (typeof loadAndDisplayPendingApprovals === 'function') await loadAndDisplayPendingApprovals();
            else console.error("loadAndDisplayPendingApprovals function not found.");
            break;
        case 'goodsReceiving':
            if (typeof loadAndDisplayApprovedRequisitionsForReceiving === 'function') {
                await loadAndDisplayApprovedRequisitionsForReceiving();
            } else {
                console.error("loadAndDisplayApprovedRequisitionsForReceiving function not found.");
            }
            if (typeof loadAndDisplayManualGoodsReceivedList === 'function') { // Also load manual list
                await loadAndDisplayManualGoodsReceivedList();
            } else {
                console.error("loadAndDisplayManualGoodsReceivedList function not found.");
            }
            break;
        case 'dispenseMedicine':
            if (typeof loadAndDisplayDispenseHistory === 'function') await loadAndDisplayDispenseHistory();
            else console.error("loadAndDisplayDispenseHistory function not found.");
            break;
        case 'unitServiceManagement':
            if (typeof loadAndDisplayUnitServices === 'function') await loadAndDisplayUnitServices();
            else console.error("loadAndDisplayUnitServices function not found.");
            break;
        case 'admin': 
             if (typeof loadAndDisplayUsers === 'function') { 
                await loadAndDisplayUsers();
            } else {
                console.error("loadAndDisplayUsers function not found for admin tab.");
            }
            break;
        default:
            console.warn(`No specific data loading function defined for tab: ${tabId}`);
    }
}

/**
 * Handles filtering data by date range for various tabs.
 * @param {string} tabIdForFilter - The ID of the tab content div where the filter is applied.
 */
function filterDataByDateRange(tabIdForFilter) {
    const startDateInputId = `startDate${tabIdForFilter.charAt(0).toUpperCase() + tabIdForFilter.slice(1).replace('Management','').replace('Approval','Apprv').replace('Receiving','Recv').replace('Medicine','Disp')}`;
    const endDateInputId = `endDate${tabIdForFilter.charAt(0).toUpperCase() + tabIdForFilter.slice(1).replace('Management','').replace('Approval','Apprv').replace('Receiving','Recv').replace('Medicine','Disp')}`;

    const startDateInput = document.getElementById(startDateInputId);
    const endDateInput = document.getElementById(endDateInputId);

    const startDate = startDateInput ? startDateInput.value : '';
    const endDate = endDateInput ? endDateInput.value : '';   

    console.log(`Filtering data for tab: ${tabIdForFilter}, Start: ${startDate}, End: ${endDate}`);
    
    // Re-load data for the current tab; the loading function will use the new date values
    // and the existing currentUser context.
    loadDataForTab(tabIdForFilter); 
}
