// script.js

// --- Global Variables & Constants ---
const API_BASE_URL = 'http://127.0.0.1:5000/api'; 
let currentSuggestionIndex = -1; 

// --- Helper Functions for Date Formatting ---
function formatDateToThaiString(dateInput) {
    if (!dateInput) return '-';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '-'; 
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear() + 543; 
    return `${day}/${month}/${year}`;
}

function getCurrentThaiDateString() {
    return formatDateToThaiString(new Date());
}

function parseThaiDateStringToDate(thaiDateString) {
    if (!thaiDateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(thaiDateString)) {
        console.warn("Invalid Thai date string format for parsing:", thaiDateString);
        return null;
    }
    const parts = thaiDateString.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const buddhistYear = parseInt(parts[2], 10);

    if (buddhistYear < 2500) { 
        console.warn("Buddhist year seems too low for parsing:", buddhistYear);
        return null;
    }
    const christianYear = buddhistYear - 543;
    const date = new Date(christianYear, month, day);
    if (date.getFullYear() === christianYear && date.getMonth() === month && date.getDate() === day) {
        return date;
    }
    console.warn("Failed to parse Thai date after construction:", thaiDateString);
    return null;
}

function autoFormatThaiDateInput(event) {
    const input = event.target;
    let value = input.value.replace(/\D/g, ''); 
    let formattedValue = '';

    if (value.length > 0) formattedValue = value.substring(0, 2); 
    if (value.length > 2) formattedValue += '/' + value.substring(2, 4); 
    if (value.length > 4) formattedValue += '/' + value.substring(4, 8); 
    
    input.value = formattedValue;
    input.setSelectionRange(formattedValue.length, formattedValue.length);
}

function getFiscalYearRange() {
    const today = new Date();
    const currentMonth = today.getMonth(); 
    const currentChristianYear = today.getFullYear();
    let fiscalYearStartChristianYear, fiscalYearEndChristianYear;

    if (currentMonth >= 9) { 
        fiscalYearStartChristianYear = currentChristianYear;
        fiscalYearEndChristianYear = currentChristianYear + 1;
    } else { 
        fiscalYearStartChristianYear = currentChristianYear - 1;
        fiscalYearEndChristianYear = currentChristianYear;
    }
    
    const fiscalYearStartDate = new Date(fiscalYearStartChristianYear, 9, 1); 
    const fiscalYearEndDate = new Date(fiscalYearEndChristianYear, 8, 30); 

    return {
        startDate: formatDateToThaiString(fiscalYearStartDate),
        endDate: formatDateToThaiString(fiscalYearEndDate)
    };
}

// --- Modal Control ---
function openModal(modalId) {
    console.log('Attempting to open modal with ID:', modalId); 
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal element not found for ID:', modalId);
        return;
    }
    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('active');
    }, 10); 
    console.log('Modal display set to block and active class added (attempted).'); 
}

function closeModal(modalId) {
    console.log('Attempting to close modal with ID:', modalId); 
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal element not found for ID:', modalId);
        return;
    }
    modal.classList.remove('active');
    
    let transitionEnded = false;
    const transitionEndHandler = () => {
        if (!transitionEnded) {
            transitionEnded = true;
            modal.style.display = 'none';
            const modalBody = modal.querySelector('#modalBody'); 
            if (modalBody) {
                modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>'; 
            }
            modal.removeEventListener('transitionend', transitionEndHandler);
            console.log('Modal closed and display set to none via transitionend.'); 
        }
    };
    
    modal.addEventListener('transitionend', transitionEndHandler);

    setTimeout(() => {
        if (!transitionEnded) { 
            modal.style.display = 'none';
            const modalBody = modal.querySelector('#modalBody');
            if (modalBody) {
                modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>';
            }
            modal.removeEventListener('transitionend', transitionEndHandler); 
            console.log('Modal closed and display set to none via timeout fallback.'); 
        }
    }, 350); 
}


// --- DOMContentLoaded: Initial Setup ---
document.addEventListener('DOMContentLoaded', function () {
    const tabs = document.querySelectorAll('.tab-link');
    const contents = document.querySelectorAll('.tab-content');
    const defaultTab = 'dashboard';
    const activeTabKey = 'activeInventoryTabSHPH'; 

    function setActiveTab(tabId) {
        if (!tabId || !document.getElementById(tabId)) { 
            tabId = defaultTab;
        }
        contents.forEach(content => {
            content.classList.remove('active');
            if (content.id === tabId) {
                content.classList.add('active');
                loadDataForTab(tabId); 
            }
        });
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === tabId) {
                tab.classList.add('active');
            }
        });
        localStorage.setItem(activeTabKey, tabId);
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', function (event) {
            event.preventDefault();
            const tabId = this.dataset.tab;
            setActiveTab(tabId);
        });
    });

    const savedTab = localStorage.getItem(activeTabKey);
    setActiveTab(savedTab || defaultTab); 

    document.addEventListener('input', function(event) {
        if (event.target.classList.contains('thai-date-formatter')) {
            autoFormatThaiDateInput(event);
        }
    });

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

    document.addEventListener('click', function(event) {
        const openSuggestionBoxes = document.querySelectorAll('.suggestions-box');
        openSuggestionBoxes.forEach(box => {
            let isClickOnSearchInput = false;
            if (event.target.classList.contains('medicine-search-input')) {
                if (box.previousElementSibling === event.target || (box.previousElementSibling && box.previousElementSibling.previousElementSibling === event.target) ) { 
                    isClickOnSearchInput = true;
                }
            }
            if (!box.contains(event.target) && !isClickOnSearchInput) {
                box.innerHTML = '';
                box.classList.add('hidden');
            }
        });
    });
});

// --- Data Loading and API Interaction ---
async function loadDataForTab(tabId) {
    console.log(`Loading data for tab: ${tabId}`);
    await new Promise(resolve => setTimeout(resolve, 50)); 

    switch (tabId) {
        case 'medicineMaster':
            await loadAndDisplayMedicines();
            break;
        case 'inventoryManagement':
            await loadAndDisplayInventorySummary();
            break;
        case 'requisitionManagement':
            await loadAndDisplayRequisitions();
            break;
        case 'requisitionApproval':
            await loadAndDisplayPendingApprovals();
            break;
        case 'goodsReceiving':
            await loadAndDisplayApprovedRequisitionsForReceiving();
            break;
        case 'dispenseMedicine':
            await loadAndDisplayDispenseHistory();
            break;
        case 'unitServiceManagement':
            await loadAndDisplayUnitServices();
            break;
        case 'dashboard':
            break;
    }
}

async function fetchData(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! Status: ${response.status}` }));
            throw new Error(errorData.message || errorData.error || `HTTP error! Status: ${response.status}`);
        }
        if (response.status === 204) { 
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        Swal.fire('เกิดข้อผิดพลาด!', `ไม่สามารถดำเนินการได้: ${error.message}`, 'error');
        throw error; 
    }
}

// == Unit Services ==
async function loadAndDisplayUnitServices() {
    const tableBody = document.getElementById("unitServiceTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลหน่วยบริการ...</td></tr>';
    try {
        const unitServices = await fetchData('/unitservices');
        tableBody.innerHTML = ''; 

        if (!unitServices || unitServices.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-gray-500 py-4">ไม่พบข้อมูลหน่วยบริการ</td></tr>';
            return;
        }

        unitServices.forEach(service => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${service.hcode}</td>
                <td>${service.name}</td>
                <td>
                    <button onclick='openEditUnitServiceModal(${JSON.stringify(service)})' class="btn btn-warning btn-sm text-xs px-2 py-1 mr-1">แก้ไข</button>
                    <button onclick="confirmDeleteUnitService('${service.hcode}', '${service.name}')" class="btn btn-danger btn-sm text-xs px-2 py-1">ลบ</button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลหน่วยบริการ</td></tr>';
    }
}

function openAddUnitServiceModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = 'เพิ่มหน่วยบริการใหม่';
    modalBody.innerHTML = `
        <form id="addUnitServiceForm">
            <div class="mb-4">
                <label for="addUnitHcode" class="label">รหัสหน่วยบริการ (HCODE 5 หลัก):</label>
                <input type="text" id="addUnitHcode" name="hcode" class="input-field" maxlength="5" pattern="[0-9]{5}" title="กรุณากรอกรหัสหน่วยบริการ 5 หลัก" required>
            </div>
            <div class="mb-4">
                <label for="addUnitName" class="label">ชื่อหน่วยบริการ:</label>
                <input type="text" id="addUnitName" name="name" class="input-field" required>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึก</button>
            </div>
        </form>
    `;
    openModal('formModal'); 

    document.getElementById('addUnitServiceForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const unitServiceData = Object.fromEntries(formData.entries());

        try {
            const responseData = await fetchData('/unitservices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(unitServiceData)
            });
            Swal.fire('สำเร็จ', responseData.message || 'เพิ่มหน่วยบริการใหม่เรียบร้อยแล้ว', 'success');
            closeModal('formModal');
            loadAndDisplayUnitServices(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

function openEditUnitServiceModal(serviceData) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = 'แก้ไขข้อมูลหน่วยบริการ: ' + serviceData.hcode;
    modalBody.innerHTML = `
        <form id="editUnitServiceForm">
            <input type="hidden" id="originalUnitHcode" value="${serviceData.hcode}">
            <div class="mb-4">
                <label for="editUnitHcode" class="label">รหัสหน่วยบริการ (HCODE 5 หลัก):</label>
                <input type="text" id="editUnitHcode" name="hcode" class="input-field" value="${serviceData.hcode}" maxlength="5" pattern="[0-9]{5}" title="กรุณากรอกรหัสหน่วยบริการ 5 หลัก" required>
            </div>
            <div class="mb-4">
                <label for="editUnitName" class="label">ชื่อหน่วยบริการ:</label>
                <input type="text" id="editUnitName" name="name" class="input-field" value="${serviceData.name}" required>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
            </div>
        </form>
    `;
    openModal('formModal');

    document.getElementById('editUnitServiceForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const updatedUnitServiceData = Object.fromEntries(formData.entries());
        const originalHcode = document.getElementById('originalUnitHcode').value;

        try {
            const responseData = await fetchData(`/unitservices/${originalHcode}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUnitServiceData)
            });
            Swal.fire('สำเร็จ', responseData.message || `แก้ไขข้อมูลหน่วยบริการเรียบร้อยแล้ว`, 'success');
            closeModal('formModal');
            loadAndDisplayUnitServices(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

async function confirmDeleteUnitService(hcode, name) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: `คุณต้องการลบหน่วยบริการ ${name} (HCODE: ${hcode}) ใช่หรือไม่? การดำเนินการนี้อาจส่งผลต่อข้อมูลผู้ใช้งานที่ผูกกับหน่วยบริการนี้`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const responseData = await fetchData(`/unitservices/${hcode}`, { method: 'DELETE' });
                Swal.fire('ลบสำเร็จ!', responseData.message || `หน่วยบริการ ${name} ถูกลบแล้ว.`, 'success');
                loadAndDisplayUnitServices(); 
            } catch (error) {
                // Error handled by fetchData
            }
        }
    });
}


// == Medicines ==
async function loadAndDisplayMedicines() {
    const tableBody = document.getElementById("medicineMasterTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลยา...</td></tr>';
    try {
        const medicines = await fetchData('/medicines');
        tableBody.innerHTML = ''; 

        if (!medicines || medicines.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-4">ไม่พบข้อมูลยา</td></tr>';
            return;
        }

        medicines.forEach(med => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${med.medicine_code || '-'}</td>
                <td>${med.generic_name}</td>
                <td>${med.strength || '-'}</td>
                <td>${med.unit}</td>
                <td>${med.reorder_point}</td>
                <td>
                    <button onclick='openEditMedicineModal(${JSON.stringify(med)})' class="btn btn-warning btn-sm text-xs px-2 py-1 mr-1">แก้ไข</button>
                    <button onclick="confirmDeleteMedicine(${med.id}, '${med.generic_name}')" class="btn btn-danger btn-sm text-xs px-2 py-1">ลบ</button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลยา</td></tr>';
    }
}

function openAddMedicineModal() { // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< FUNCTION DEFINED HERE
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = 'เพิ่มรายการยาใหม่';
    modalBody.innerHTML = `
        <form id="addMedicineForm">
            <div class="mb-4">
                <label for="addMedId" class="label">รหัสยา:</label>
                <input type="text" id="addMedId" name="medicine_code" class="input-field" required>
            </div>
            <div class="mb-4">
                <label for="addGenericName" class="label">ชื่อสามัญ:</label>
                <input type="text" id="addGenericName" name="generic_name" class="input-field" required>
            </div>
            <div class="mb-4">
                <label for="addStrength" class="label">ความแรง:</label>
                <input type="text" id="addStrength" name="strength" class="input-field">
            </div>
            <div class="mb-4">
                <label for="addUnit" class="label">หน่วยนับ:</label>
                <input type="text" id="addUnit" name="unit" class="input-field" required>
            </div>
            <div class="mb-4">
                <label for="addReorderPoint" class="label">จุดสั่งซื้อขั้นต่ำ:</label>
                <input type="number" id="addReorderPoint" name="reorder_point" class="input-field" min="0" value="0" required>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึก</button>
            </div>
        </form>
    `;
    openModal('formModal');

    document.getElementById('addMedicineForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const medicineData = Object.fromEntries(formData.entries());
        medicineData.reorder_point = parseInt(medicineData.reorder_point) || 0;

        try {
            const responseData = await fetchData('/medicines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(medicineData)
            });
            Swal.fire('สำเร็จ', responseData.message || 'เพิ่มข้อมูลยาใหม่เรียบร้อยแล้ว', 'success');
            closeModal('formModal');
            loadAndDisplayMedicines(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

function openEditMedicineModal(medicineData) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = 'แก้ไขข้อมูลยา: ' + (medicineData.medicine_code || medicineData.id) ;
    modalBody.innerHTML = `
        <form id="editMedicineForm">
            <input type="hidden" id="editMedIdInternal" name="id" value="${medicineData.id}">
            <div class="mb-4">
                <label for="editMedCode" class="label">รหัสยา:</label>
                <input type="text" id="editMedCode" name="medicine_code" class="input-field" value="${medicineData.medicine_code || ''}" required>
            </div>
            <div class="mb-4">
                <label for="editGenericName" class="label">ชื่อสามัญ:</label>
                <input type="text" id="editGenericName" name="generic_name" class="input-field" value="${medicineData.generic_name || ''}" required>
            </div>
            <div class="mb-4">
                <label for="editStrength" class="label">ความแรง:</label>
                <input type="text" id="editStrength" name="strength" class="input-field" value="${medicineData.strength || ''}">
            </div>
            <div class="mb-4">
                <label for="editUnit" class="label">หน่วยนับ:</label>
                <input type="text" id="editUnit" name="unit" class="input-field" value="${medicineData.unit || ''}" required>
            </div>
            <div class="mb-4">
                <label for="editReorderPoint" class="label">จุดสั่งซื้อขั้นต่ำ:</label>
                <input type="number" id="editReorderPoint" name="reorder_point" class="input-field" value="${medicineData.reorder_point || 0}" min="0" required>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
            </div>
        </form>
    `;
    openModal('formModal');

    document.getElementById('editMedicineForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const updatedMedicineData = Object.fromEntries(formData.entries());
        updatedMedicineData.reorder_point = parseInt(updatedMedicineData.reorder_point) || 0;
        const medicineId = updatedMedicineData.id; 

        try {
            const responseData = await fetchData(`/medicines/${medicineId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedMedicineData)
            });
            Swal.fire('สำเร็จ', responseData.message || `แก้ไขข้อมูลยาเรียบร้อยแล้ว`, 'success');
            closeModal('formModal');
            loadAndDisplayMedicines(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

async function confirmDeleteMedicine(medicineId, medicineName) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: `คุณต้องการลบรายการยา ${medicineName} (ID: ${medicineId}) ใช่หรือไม่? (จะถูกตั้งเป็นไม่ใช้งาน)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const responseData = await fetchData(`/medicines/${medicineId}`, { method: 'DELETE' });
                Swal.fire('ลบสำเร็จ!', responseData.message || `รายการยา ${medicineName} ถูกตั้งเป็นไม่ใช้งานแล้ว.`, 'success');
                loadAndDisplayMedicines(); 
            } catch (error) {
                // Error handled by fetchData
            }
        }
    });
}

// == Inventory ==
async function loadAndDisplayInventorySummary() {
    const tableBody = document.getElementById("inventoryManagementTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลคลังยา...</td></tr>';
    try {
        const inventorySummary = await fetchData('/inventory');
        tableBody.innerHTML = '';

        if (!inventorySummary || inventorySummary.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบข้อมูลคลังยา</td></tr>';
            return;
        }

        inventorySummary.forEach(item => {
            const row = tableBody.insertRow();
            const statusClass = item.status === 'ใกล้หมด' ? 'bg-yellow-100 text-yellow-800' : (item.status === 'หมด' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800');
            row.innerHTML = `
                <td>${item.medicine_code || '-'}</td>
                <td>${item.generic_name} ${item.strength || ''}</td>
                <td>${item.total_quantity_on_hand || 0} ${item.unit}</td>
                <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${item.status}</span></td>
                <td><button onclick="openInventoryHistoryModal(${item.medicine_id}, '${item.generic_name} ${item.strength || ''}')" class="btn btn-secondary btn-sm text-xs px-2 py-1">ดูประวัติ</button></td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลคลังยา</td></tr>';
    }
}

// == Requisitions ==
async function loadAndDisplayRequisitions() {
    const tableBody = document.getElementById("requisitionManagementTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลใบเบิก...</td></tr>';
    
    const startDate = document.getElementById('startDateReq').value;
    const endDate = document.getElementById('endDateReq').value;
    
    try {
        const requisitions = await fetchData(`/requisitions?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
        tableBody.innerHTML = '';

        if (!requisitions || requisitions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบข้อมูลใบเบิกในช่วงวันที่ที่เลือก</td></tr>';
            return;
        }

        requisitions.forEach(req => {
            const row = tableBody.insertRow();
            let statusClass = '';
            switch(req.status) {
                case 'รออนุมัติ': statusClass = 'bg-yellow-100 text-yellow-800'; break;
                case 'อนุมัติแล้ว':
                case 'อนุมัติบางส่วน': 
                    statusClass = 'bg-blue-100 text-blue-800'; break;
                case 'รับยาแล้ว': statusClass = 'bg-green-100 text-green-800'; break;
                case 'ปฏิเสธ':
                case 'ยกเลิก': 
                    statusClass = 'bg-red-100 text-red-800'; break;
                default: statusClass = 'bg-gray-100 text-gray-800';
            }
            row.innerHTML = `
                <td>${req.requisition_number}</td>
                <td>${req.requisition_date}</td>
                <td>${req.requester_name}</td>
                <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${req.status}</span></td>
                <td>
                    <button onclick="openRequisitionDetailsModal('${req.requisition_number}', '${req.requester_name}', '${req.requisition_date}', '${req.status}', ${req.id})" class="btn btn-secondary btn-sm text-xs px-2 py-1">ดูรายละเอียด</button>
                    ${req.status === 'รออนุมัติ' ? `<button onclick="cancelRequisition(${req.id})" class="btn btn-danger btn-sm text-xs px-2 py-1 ml-1">ยกเลิก</button>` : ''}
                </td>
            `;
        });
    } catch (error) {
         tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิก</td></tr>';
    }
}

async function loadAndDisplayPendingApprovals() {
    const tableBody = document.getElementById("requisitionApprovalTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลใบเบิกรออนุมัติ...</td></tr>';
    
    const startDate = document.getElementById('startDateApprv').value;
    const endDate = document.getElementById('endDateApprv').value;

    try {
        const requisitions = await fetchData(`/requisitions/pending_approval?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
        tableBody.innerHTML = '';

        if (!requisitions || requisitions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบใบเบิกที่รออนุมัติในช่วงวันที่ที่เลือก</td></tr>';
            return;
        }

        requisitions.forEach(req => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${req.requisition_number}</td>
                <td>${req.requester_hospital_name || req.requester_name}</td> 
                <td>${req.requisition_date}</td>
                <td>${req.item_count}</td>
                <td>
                    <button onclick="openApproveRequisitionModal(${req.id}, '${req.requisition_number}')" class="btn btn-primary btn-sm text-xs px-2 py-1">ตรวจสอบและอนุมัติ</button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิกรออนุมัติ</td></tr>';
    }
}
async function loadAndDisplayApprovedRequisitionsForReceiving() {
    const tableBody = document.getElementById("goodsReceivingTableBody");
     if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลการรับยา...</td></tr>';
    // TODO: Implement API call and rendering
}
async function loadAndDisplayDispenseHistory() {
    const tableBody = document.getElementById("dispenseHistoryTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">กำลังโหลดประวัติการตัดจ่ายยา...</td></tr>';
    // TODO: Implement API call and rendering
}


// --- Modal Content Functions (Forms & Details) ---

async function openInventoryHistoryModal(medicineId, medicineName) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = `ประวัติยา: ${medicineName} (รหัส: ${medicineId})`;
    modalBody.innerHTML = `<p class="text-center text-gray-400 py-4">กำลังโหลดประวัติยา...</p>`;
    openModal('formModal');

    try {
        const history = await fetchData(`/inventory/history/${medicineId}`);
        let historyHtml = `
            <div class="overflow-x-auto">
                <table class="custom-table text-sm">
                    <thead>
                        <tr>
                            <th>วันที่</th>
                            <th>รายการ</th>
                            <th>Lot No.</th>
                            <th>Exp. Date</th>
                            <th class="text-center">รับ</th>
                            <th class="text-center">จ่าย</th>
                            <th class="text-center">คงเหลือ (Lot)</th>
                            <th>ผู้ทำรายการ</th>
                            <th>หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (!history || history.length === 0) {
            historyHtml += '<tr><td colspan="9" class="text-center text-gray-500 py-4">ไม่พบประวัติการเคลื่อนไหว</td></tr>';
        } else {
            history.forEach(item => {
                historyHtml += `
                    <tr>
                        <td>${item.transaction_date}</td>
                        <td>${item.transaction_type}</td>
                        <td>${item.lot_number}</td>
                        <td>${item.expiry_date}</td>
                        <td class="text-green-600 text-center">${item.quantity_change > 0 ? '+' + item.quantity_change : '-'}</td>
                        <td class="text-red-600 text-center">${item.quantity_change < 0 ? item.quantity_change : '-'}</td>
                        <td class="text-center">${item.quantity_after_transaction}</td>
                        <td>${item.user_full_name || '-'}</td>
                        <td>${item.remarks || '-'}</td>
                    </tr>
                `;
            });
        }
        historyHtml += `
                    </tbody>
                </table>
            </div>
            <div class="flex justify-end mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
            </div>
        `;
        modalBody.innerHTML = historyHtml;
    } catch (error) {
        modalBody.innerHTML = `<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดประวัติยา</p>
                               <div class="flex justify-end mt-6"><button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button></div>`;
    }
}

async function openRequisitionDetailsModal(requisitionNumber, requester, date, status, requisitionId) { 
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = `รายละเอียดใบเบิกเลขที่: ${requisitionNumber}`;
    modalBody.innerHTML = `
        <div class="space-y-3 mb-4">
            <p><strong>ผู้เบิก:</strong> ${requester}</p>
            <p><strong>วันที่เบิก:</strong> ${date}</p>
            <p><strong>สถานะ:</strong> <span class="font-semibold ${status === 'รออนุมัติ' ? 'text-yellow-600' : 'text-green-600'}">${status}</span></p>
        </div>
        <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่เบิก:</h4>
        <div class="overflow-x-auto">
            <table class="custom-table text-sm">
                <thead><tr><th>รหัสยา</th><th>ชื่อยา</th><th>ความแรง</th><th>หน่วยนับ</th><th>จำนวนขอเบิก</th><th>จำนวนอนุมัติ</th></tr></thead>
                <tbody id="requisitionDetailItemsTableBody">
                    <tr><td colspan="6" class="text-center py-3">กำลังโหลดรายการยา...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="flex justify-end mt-6 space-x-3">
            ${status === 'รออนุมัติ' ? `<button type="button" class="btn btn-danger" onclick="cancelRequisition(${requisitionId})">ยกเลิกใบเบิก</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal');

    const itemsTableBody = document.getElementById('requisitionDetailItemsTableBody');
    try {
        const items = await fetchData(`/requisitions/${requisitionId}/items`);
        itemsTableBody.innerHTML = '';
        if (items && items.length > 0) {
            items.forEach(item => {
                const row = itemsTableBody.insertRow();
                row.innerHTML = `
                    <td>${item.medicine_code || '-'}</td>
                    <td>${item.generic_name}</td>
                    <td>${item.strength || '-'}</td>
                    <td>${item.unit}</td>
                    <td class="text-center">${item.quantity_requested}</td>
                    <td class="text-center">${item.quantity_approved !== null ? item.quantity_approved : '-'}</td>
                `;
            });
        } else {
            itemsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-4">ไม่พบรายการยาในใบเบิกนี้</td></tr>';
        }
    } catch (error) {
        itemsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดรายการยา</td></tr>';
    }
}

function openCreateRequisitionModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = 'สร้างใบเบิกยาใหม่';
    modalBody.innerHTML = `
        <form id="createRequisitionForm">
            <p class="text-sm text-gray-600 mb-4">ระบบจะแสดงรายการยาที่ต่ำกว่าจุดสั่งซื้อให้อัตโนมัติ (ถ้ามี)</p>
            <div class="mb-4">
                <label for="reqDate" class="label">วันที่เบิก:</label>
                <input type="text" id="reqDate" name="requisition_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
            </div>
            <div class="mb-4">
                <label for="requesterId" class="label">ผู้เบิก:</label>
                <input type="text" id="requesterName" name="requester_name" class="input-field" value="${document.getElementById('currentUser').textContent}" readonly> 
                <input type="hidden" id="requesterId" name="requester_id" value="1"> </div>
            <div class="mb-4">
                <label class="label">รายการยาที่ต้องการเบิก:</label>
                <div id="requisitionItemsContainer">
                    <div class="flex items-center space-x-2 mb-2 relative">
                        <input type="text" 
                               placeholder="ค้นหารหัสยา/ชื่อยา" 
                               class="input-field flex-grow !mb-0 medicine-search-input" 
                               name="items[0][medicine_display_name]" 
                               oninput="handleMedicineSearch(event, 0)" 
                               onkeydown="navigateSuggestions(event, 0)"
                               autocomplete="off"
                               required>
                        <input type="hidden" name="items[0][medicine_id]">
                        <div class="suggestions-box absolute top-full left-0 z-10 w-full bg-white border border-gray-300 rounded-md mt-1 shadow-lg hidden max-h-40 overflow-y-auto"></div>
                        <input type="number" placeholder="จำนวน" class="input-field w-24 !mb-0" name="items[0][quantity_requested]" min="1" required>
                        <button type="button" class="btn btn-danger btn-sm text-xs !p-2" onclick="this.parentElement.remove()">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>
                        </button>
                    </div>
                </div>
                <button type="button" class="btn btn-success btn-sm text-xs mt-2" 
                        onclick="addDynamicItemRow('requisitionItemsContainer', ['medicine-search', 'number'], ['ค้นหารหัสยา/ชื่อยา', 'จำนวน'], ['medicine_id', 'quantity_requested'], 'items')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-lg mr-1" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/></svg>
                    เพิ่มรายการยา
                </button>
            </div>
             <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">ส่งใบเบิก</button>
            </div>
        </form>
    `;
    openModal('formModal');

     document.getElementById('createRequisitionForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const requisitionData = {
            requisition_date: formData.get('requisition_date'), 
            requester_id: parseInt(formData.get('requester_id')),
            items: []
        };
        
        const itemRows = document.querySelectorAll('#requisitionItemsContainer > div');
        itemRows.forEach((row, index) => {
            const medIdInput = row.querySelector(`input[name="items[${index}][medicine_id]"]`);
            const qtyInput = row.querySelector(`input[name="items[${index}][quantity_requested]"]`);
            if (medIdInput && medIdInput.value && qtyInput && qtyInput.value) { 
                 requisitionData.items.push({
                    medicine_id: parseInt(medIdInput.value),
                    quantity_requested: parseInt(qtyInput.value)
                });
            }
        });

        if (requisitionData.items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเพิ่มรายการยาอย่างน้อย 1 รายการ และเลือกยาให้ครบถ้วน', 'error');
            return;
        }

        try {
            const responseData = await fetchData('/requisitions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requisitionData)
            });
            Swal.fire('ส่งสำเร็จ', responseData.message || 'ใบเบิกยาถูกส่งไปยัง รพ.แม่ข่ายแล้ว', 'success');
            closeModal('formModal');
            loadAndDisplayRequisitions(); 
        } catch (error) {
            // Error handled
        }
    });
}

async function handleMedicineSearch(event, rowIndex) {
    const inputElement = event.target;
    const searchTerm = inputElement.value;
    const suggestionsBox = inputElement.parentElement.querySelector('.suggestions-box');
    const hiddenMedIdInput = inputElement.parentElement.querySelector(`input[name*="[${rowIndex}][medicine_id]"]`); 

    if (event.type === 'input') { 
        currentSuggestionIndex = -1;
    }

    if (searchTerm.length < 1 && event.type === 'input') { 
        suggestionsBox.innerHTML = '';
        suggestionsBox.classList.add('hidden');
        if(hiddenMedIdInput) hiddenMedIdInput.value = ''; 
        return;
    }
    
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key) && !suggestionsBox.classList.contains('hidden')) {
        return;
    }

    try {
        const medicines = await fetchData(`/medicines/search?term=${encodeURIComponent(searchTerm)}`);
        
        suggestionsBox.innerHTML = '';
        if (medicines && medicines.length > 0) {
            medicines.forEach((med, index) => {
                const suggestionItem = document.createElement('div');
                suggestionItem.classList.add('p-2', 'hover:bg-gray-100', 'cursor-pointer', 'text-sm', 'suggestion-item');
                suggestionItem.textContent = `${med.medicine_code} - ${med.generic_name} (${med.strength || 'N/A'})`;
                suggestionItem.dataset.medicineId = med.id; 
                suggestionItem.dataset.medicineDisplayName = `${med.medicine_code} - ${med.generic_name}`;

                suggestionItem.addEventListener('click', () => {
                    inputElement.value = suggestionItem.dataset.medicineDisplayName; 
                    if(hiddenMedIdInput) hiddenMedIdInput.value = suggestionItem.dataset.medicineId; 
                    suggestionsBox.innerHTML = '';
                    suggestionsBox.classList.add('hidden');
                    currentSuggestionIndex = -1;
                });
                suggestionsBox.appendChild(suggestionItem);
            });
            suggestionsBox.classList.remove('hidden');
        } else {
            suggestionsBox.innerHTML = '<div class="p-2 text-gray-500 text-sm">ไม่พบยาที่ค้นหา</div>';
            suggestionsBox.classList.remove('hidden');
             if(hiddenMedIdInput) hiddenMedIdInput.value = ''; 
        }
    } catch (error) {
        console.error("Error searching medicines:", error);
        suggestionsBox.innerHTML = '<div class="p-2 text-red-500 text-sm">เกิดข้อผิดพลาดในการค้นหา</div>';
        suggestionsBox.classList.remove('hidden');
         if(hiddenMedIdInput) hiddenMedIdInput.value = '';
    }
}

function navigateSuggestions(event, rowIndex) {
    const inputElement = event.target;
    const suggestionsBox = inputElement.parentElement.querySelector('.suggestions-box');
    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    
    if (suggestionsBox.classList.contains('hidden') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        handleMedicineSearch({ target: inputElement, type: 'input' }, rowIndex); 
        return; 
    }
    
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault(); 
        currentSuggestionIndex++;
        if (currentSuggestionIndex >= items.length) {
            currentSuggestionIndex = 0; 
        }
    } else if (event.key === 'ArrowUp') {
        event.preventDefault(); 
        currentSuggestionIndex--;
        if (currentSuggestionIndex < 0) {
            currentSuggestionIndex = items.length - 1; 
        }
    } else if (event.key === 'Enter') {
        event.preventDefault(); 
        if (currentSuggestionIndex >= 0 && currentSuggestionIndex < items.length) {
            items[currentSuggestionIndex].click(); 
        }
        suggestionsBox.innerHTML = '';
        suggestionsBox.classList.add('hidden');
        currentSuggestionIndex = -1;
        return; 
    } else if (event.key === 'Escape') {
        suggestionsBox.innerHTML = '';
        suggestionsBox.classList.add('hidden');
        currentSuggestionIndex = -1;
        return;
    } else {
        return; 
    }

    items.forEach((item, index) => {
        if (index === currentSuggestionIndex) {
            item.classList.add('suggestion-active');
            item.scrollIntoView({ block: 'nearest' }); 
        } else {
            item.classList.remove('suggestion-active');
        }
    });
}


function addDynamicItemRow(containerId, fieldTypes, placeholders, baseFieldNames, arrayName = null) {
    const itemsContainer = document.getElementById(containerId);
    if (!itemsContainer) return;
    const itemCount = itemsContainer.children.length; 

    const newItemRow = document.createElement('div');
    newItemRow.className = 'flex items-center space-x-2 mb-2 animate-fadeIn relative'; 
    
    let fieldsHtml = '';
    for (let i = 0; i < fieldTypes.length; i++) {
        const type = fieldTypes[i]; 
        const placeholder = placeholders[i] || '';
        const name = arrayName ? `${arrayName}[${itemCount}][${baseFieldNames[i]}]` : baseFieldNames[i];
        
        let fieldClass = 'input-field flex-grow !mb-0';
        let inputValue = '';
        let extraClass = '';
        let inputHtml = '';

        if (type === 'medicine-search') {
            const displayName = arrayName ? `${arrayName}[${itemCount}][medicine_display_name]` : 'medicine_display_name';
            inputHtml = `
                <input type="text" 
                       placeholder="${placeholder}" 
                       class="${fieldClass} medicine-search-input" 
                       name="${displayName}" 
                       oninput="handleMedicineSearch(event, ${itemCount})" 
                       onkeydown="navigateSuggestions(event, ${itemCount})"
                       autocomplete="off"
                       required>
                <input type="hidden" name="${name}">
                <div class="suggestions-box absolute top-full left-0 z-10 w-full bg-white border border-gray-300 rounded-md mt-1 shadow-lg hidden max-h-40 overflow-y-auto"></div>
            `;
        } else {
            if (type === 'number') fieldClass = 'input-field w-24 !mb-0';
            if (type === 'date-thai') { 
                 fieldClass = 'input-field w-40 !mb-0';
                 inputValue = `value="${getCurrentThaiDateString()}"`; 
                 extraClass = 'thai-date-formatter';
            }
            inputHtml = `<input type="${type === 'date-thai' ? 'text' : type}" placeholder="${placeholder}" class="${fieldClass} ${extraClass}" name="${name}" ${type === 'number' ? 'min="0"' : ''} ${inputValue} required>`;
        }
        fieldsHtml += inputHtml;
    }

    newItemRow.innerHTML = `
        ${fieldsHtml}
        <button type="button" class="btn btn-danger btn-sm text-xs !p-2" onclick="this.parentElement.remove()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>
        </button>
    `;
    itemsContainer.appendChild(newItemRow);
}


function openManualDispenseModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = 'ตัดจ่ายยา (กรอกข้อมูลเอง)';
    modalBody.innerHTML = `
        <form id="manualDispenseForm">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <div class="mb-4">
                    <label for="dispenseDate" class="label">วันที่จ่าย:</label>
                    <input type="text" id="dispenseDate" name="dispense_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
                </div>
                <div class="mb-4">
                    <label for="dispenserName" class="label">ผู้จ่ายยา:</label>
                    <input type="text" id="dispenserName" name="dispenser_name" class="input-field" placeholder="ชื่อผู้จ่ายยา" value="${document.getElementById('currentUser').textContent}" required>
                     <input type="hidden" id="dispenserId" name="dispenser_id" value="1"> </div>
            </div>
            
            <hr class="my-6">

            <div class="mb-4">
                <label class="label">รายการยาที่จ่าย:</label>
                <div id="dispenseItemsContainer">
                    <div class="flex items-center space-x-2 mb-2 relative">
                        <input type="text" placeholder="ค้นหารหัสยา/ชื่อยา" class="input-field flex-grow !mb-0 medicine-search-input" name="items[0][medicine_display_name]" oninput="handleMedicineSearch(event, 0)" onkeydown="navigateSuggestions(event, 0)" autocomplete="off" required>
                        <input type="hidden" name="items[0][medicine_id]">
                        <div class="suggestions-box absolute top-full left-0 z-10 w-full bg-white border border-gray-300 rounded-md mt-1 shadow-lg hidden max-h-40 overflow-y-auto"></div>
                        <input type="text" placeholder="เลขที่ล็อต" class="input-field w-32 !mb-0" name="items[0][lot_number]" required>
                        <input type="text" placeholder="dd/mm/yyyy" class="input-field w-40 !mb-0 thai-date-formatter" name="items[0][expiry_date]" value="${getCurrentThaiDateString()}" required>
                        <input type="number" placeholder="จำนวน" class="input-field w-24 !mb-0" min="1" name="items[0][quantity_dispensed]" required>
                        <button type="button" class="btn btn-danger btn-sm text-xs !p-2" onclick="this.parentElement.remove()">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>
                        </button>
                    </div>
                </div>
                <button type="button" class="btn btn-success btn-sm text-xs mt-2" 
                        onclick="addDynamicItemRow('dispenseItemsContainer', ['medicine-search', 'text', 'date-thai', 'number'], ['ค้นหารหัสยา/ชื่อยา', 'เลขที่ล็อต', 'dd/mm/yyyy', 'จำนวน'], ['medicine_id', 'lot_number', 'expiry_date', 'quantity_dispensed'], 'items')">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-lg mr-1" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/></svg>
                    เพิ่มรายการยา
                </button>
            </div>

             <div class="flex justify-end space-x-3 mt-8">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกการตัดจ่าย</button>
            </div>
        </form>
    `;
    openModal('formModal');
    document.getElementById('manualDispenseForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const dispenseData = {
            dispense_date: formData.get('dispense_date'), 
            dispenser_id: parseInt(formData.get('dispenser_id')), 
            dispenser_name: formData.get('dispenser_name'), 
            items: []
        };

        const itemRows = document.querySelectorAll('#dispenseItemsContainer > div');
        itemRows.forEach((row, index) => {
            const medIdInput = row.querySelector(`input[name="items[${index}][medicine_id]"]`);
            const lotInput = row.querySelector(`input[name="items[${index}][lot_number]"]`);
            const expDateInput = row.querySelector(`input[name="items[${index}][expiry_date]"]`);
            const qtyInput = row.querySelector(`input[name="items[${index}][quantity_dispensed]"]`);

            if (medIdInput && medIdInput.value && lotInput && lotInput.value && expDateInput && expDateInput.value && qtyInput && qtyInput.value) {
                 dispenseData.items.push({
                    medicine_id: parseInt(medIdInput.value),
                    lot_number: lotInput.value,
                    expiry_date: expDateInput.value, 
                    quantity_dispensed: parseInt(qtyInput.value)
                });
            }
        });
        
        if (dispenseData.items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเพิ่มรายการยาอย่างน้อย 1 รายการ และเลือกยาให้ครบถ้วน', 'error');
            return;
        }

        try {
            const responseData = await fetchData('/dispense/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dispenseData)
            });
            Swal.fire('บันทึกสำเร็จ', responseData.message || 'ข้อมูลการตัดจ่ายยาได้รับการบันทึกแล้ว', 'success');
            closeModal('formModal');
            loadAndDisplayDispenseHistory(); 
            loadAndDisplayInventorySummary(); 
        } catch (error) {
            // Error handled
        }
    });
}


function viewDispenseDetails(dispenseId, details) { 
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = `รายละเอียดการตัดจ่ายยาเลขที่: ${dispenseId}`;
    
    let itemsHtml = '';
    if(details.items && details.items.length > 0) {
        details.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.medicineCode || '-'}</td>
                    <td>${item.medicineName || '-'}</td>
                    <td>${item.lotNumber || '-'}</td>
                    <td>${item.expiryDate || '-'}</td> 
                    <td>${item.quantity || '-'}</td>
                </tr>
            `;
        });
    } else {
        itemsHtml = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบรายการยา</td></tr>';
    }

    modalBody.innerHTML = `
        <div class="space-y-3 mb-4">
            <p><strong>วันที่จ่าย:</strong> ${details.date || '-'}</p> 
            <p><strong>ผู้จ่ายยา:</strong> ${details.dispenser || '-'}</p>
        </div>
        <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่จ่าย:</h4>
        <div class="overflow-x-auto">
            <table class="custom-table text-sm">
                <thead><tr><th>รหัสยา</th><th>ชื่อยา</th><th>เลขที่ล็อต</th><th>วันหมดอายุ</th><th>จำนวน</th></tr></thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        </div>
        <div class="flex justify-end mt-6 space-x-3">
             <button type="button" class="btn btn-warning">แก้ไขรายการ</button>
            <button type="button" class="btn btn-danger">ยกเลิกการตัดจ่าย</button>
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal');
}

function openApproveRequisitionModal(requisitionId) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = `อนุมัติใบเบิกยาเลขที่: ${requisitionId}`;
    modalBody.innerHTML = `
        <form id="approveRequisitionForm">
            <div class="space-y-2 mb-4">
                <p><strong>รพสต. ผู้ขอเบิก:</strong> <span id="approveReqHospital">กำลังโหลด...</span></p>
                <p><strong>วันที่ขอเบิก:</strong> <span id="approveReqDate">กำลังโหลด...</span></p>
            </div>
            <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่ขอเบิก:</h4>
            <div class="overflow-x-auto mb-4">
                <table class="custom-table text-sm">
                    <thead><tr><th>ชื่อยา</th><th>จำนวนขอเบิก</th><th>จำนวนอนุมัติ</th><th>Lot No. (จ่ายจาก)</th><th>Exp. Date</th><th>เหตุผล</th><th>ดำเนินการ</th></tr></thead>
                    <tbody id="approveRequisitionItemsTableBody">
                        <tr><td colspan="7" class="text-center py-3">กำลังโหลดรายการยา...</td></tr>
                    </tbody>
                </table>
            </div>
             <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">ยืนยันการอนุมัติ</button>
            </div>
        </form>
    `;
    openModal('formModal');
}

function openReceiveGoodsModal(requisitionId) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = `ยืนยันการรับยาสำหรับใบเบิก: ${requisitionId}`;
    modalBody.innerHTML = `
        <form id="receiveGoodsForm">
             <div class="space-y-2 mb-4">
                <p><strong>วันที่อนุมัติ:</strong> <span id="receiveGoodsApprovalDate">กำลังโหลด...</span></p>
                <p><strong>ผู้อนุมัติ (รพ.แม่ข่าย):</strong> <span id="receiveGoodsApprover">กำลังโหลด...</span></p>
            </div>
            <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่ได้รับ (ตามใบจ่ายยา):</h4>
             <div class="overflow-x-auto mb-4">
                <table class="custom-table text-sm">
                    <thead><tr><th>ชื่อยา</th><th>จำนวนอนุมัติ</th><th>เลขที่ล็อต (ที่ได้รับ)</th><th>วันหมดอายุ (ที่ได้รับ)</th><th>จำนวนรับจริง</th><th>หมายเหตุ</th></tr></thead>
                    <tbody id="receiveGoodsItemsTableBody">
                        <tr><td colspan="6" class="text-center py-3">กำลังโหลดรายการยา...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="mb-4">
                <label for="receiveDate" class="label">วันที่รับยา:</label>
                <input type="text" id="receiveDate" name="received_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
            </div>
             <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-success">ยืนยันการรับยา</button>
            </div>
        </form>
    `;
    openModal('formModal');
    document.getElementById('receiveGoodsForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        Swal.fire('รับยาสำเร็จ', `บันทึกการรับยาสำหรับ ${requisitionId} เรียบร้อยแล้ว สต็อกยาได้รับการอัปเดต`, 'success');
        closeModal('formModal');
        loadAndDisplayApprovedRequisitionsForReceiving();
        loadAndDisplayInventorySummary();
    });
}

function openAddNewUserModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = 'เพิ่มผู้ใช้งานใหม่';
    modalBody.innerHTML = `
        <form id="addNewUserForm">
            <div class="mb-4">
                <label for="newUsername" class="label">ชื่อผู้ใช้งาน:</label>
                <input type="text" id="newUsername" name="username" class="input-field" required>
            </div>
            <div class="mb-4">
                <label for="newFullName" class="label">ชื่อ-นามสกุล:</label>
                <input type="text" id="newFullName" name="full_name" class="input-field" required>
            </div>
            <div class="mb-4">
                <label for="newPassword" class="label">รหัสผ่าน:</label>
                <input type="password" id="newPassword" name="password" class="input-field" required>
            </div>
            <div class="mb-4">
                <label for="userRole" class="label">บทบาท:</label>
                <select id="userRole" name="role" class="input-field">
                    <option value="เจ้าหน้าที่ รพสต.">เจ้าหน้าที่ รพสต.</option>
                    <option value="เจ้าหน้าที่ รพ. แม่ข่าย">เจ้าหน้าที่ รพ. แม่ข่าย</option>
                    <option value="ผู้ดูแลระบบ">ผู้ดูแลระบบ</option>
                </select>
            </div>
             <div class="mb-4">
                <label for="userHcode" class="label">รหัสหน่วยบริการ (HCODE ถ้ามี):</label>
                <input type="text" id="userHcode" name="hcode" class="input-field" maxlength="5" placeholder="เช่น 10731">
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกผู้ใช้งาน</button>
            </div>
        </form>
    `;
    openModal('formModal');
    document.getElementById('addNewUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        Swal.fire('สำเร็จ', 'เพิ่มผู้ใช้งานใหม่เรียบร้อยแล้ว (จำลอง)', 'success');
        closeModal('formModal');
    });
}

function openEditHospitalInfoModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = 'แก้ไขข้อมูล รพสต./รพ.แม่ข่าย';
    modalBody.innerHTML = `
        <form id="editHospitalInfoForm">
            <div class="mb-4">
                <label for="hospitalName" class="label">ชื่อหน่วยงาน:</label>
                <input type="text" id="hospitalName" class="input-field" value="รพสต. บ้านสุขภาพดี (ตัวอย่าง)" required>
            </div>
            <div class="mb-4">
                <label for="hospitalAddress" class="label">ที่อยู่:</label>
                <textarea id="hospitalAddress" class="input-field" rows="3">123 หมู่ 4 ต.สุขใจ อ.เมือง จ.สมหวัง 12345 (ตัวอย่าง)</textarea>
            </div>
             <div class="mb-4">
                <label for="hospitalPhone" class="label">เบอร์โทรศัพท์ติดต่อ:</label>
                <input type="tel" id="hospitalPhone" class="input-field" value="02-123-4567 (ตัวอย่าง)">
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
            </div>
        </form>
    `;
    openModal('formModal');
     document.getElementById('editHospitalInfoForm').addEventListener('submit', (e) => {
        e.preventDefault();
        Swal.fire('สำเร็จ', 'แก้ไขข้อมูลหน่วยงานเรียบร้อยแล้ว (จำลอง)', 'success');
        closeModal('formModal');
    });
}

function openSummaryReportModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    modalTitle.textContent = 'รายงานภาพรวม (ตัวอย่าง)';
    modalBody.innerHTML = `
        <div class="space-y-4">
            <div>
                <h4 class="font-semibold text-gray-700">ยอดการใช้ยาประจำเดือน</h4>
                <p class="text-sm text-gray-600">Paracetamol 500mg: 1,200 เม็ด</p>
                <p class="text-sm text-gray-600">Amoxicillin 250mg: 350 แคปซูล</p>
                <div class="mt-2 p-4 bg-gray-50 rounded-md text-center">
                    <p class="text-lg font-semibold">กราฟแสดงแนวโน้ม (ตัวอย่าง)</p>
                    <div class="w-full h-32 bg-blue-100 rounded-md flex items-center justify-center text-blue-500">
                        [พื้นที่สำหรับกราฟ]
                    </div>
                </div>
            </div>
            <div>
                <h4 class="font-semibold text-gray-700">จำนวนใบเบิกทั้งหมด</h4>
                <p class="text-sm text-gray-600">รออนุมัติ: 5</p>
                <p class="text-sm text-gray-600">อนุมัติแล้ว: 25</p>
                <p class="text-sm text-gray-600">รับยาแล้ว: 20</p>
            </div>
        </div>
        <div class="flex justify-end mt-6">
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal');
}

function logout() {
    Swal.fire({
        title: 'ออกจากระบบ',
        text: 'คุณต้องการออกจากระบบใช่หรือไม่?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire('ออกจากระบบแล้ว', '', 'success');
            document.getElementById('currentUser').textContent = "ผู้เยี่ยมชม";
        }
    });
}

function filterDataByDateRange(tabIdPrefix) {
    const startDateInput = document.getElementById(`startDate${tabIdPrefix.charAt(0).toUpperCase() + tabIdPrefix.slice(1).replace('Management','').replace('Approval','Apprv').replace('Receiving','Recv').replace('Medicine','Disp')}`);
    const endDateInput = document.getElementById(`endDate${tabIdPrefix.charAt(0).toUpperCase() + tabIdPrefix.slice(1).replace('Management','').replace('Approval','Apprv').replace('Receiving','Recv').replace('Medicine','Disp')}`);

    const startDate = startDateInput ? startDateInput.value : 'N/A';
    const endDate = endDateInput ? endDateInput.value : 'N/A';

    Swal.fire({
        title: 'ค้นหาข้อมูลตามช่วงวันที่',
        html: `แท็บ: ${tabIdPrefix}<br>วันที่เริ่มต้น: ${startDate}<br>วันที่สิ้นสุด: ${endDate}`,
        icon: 'info',
        confirmButtonText: 'ตกลง'
    });
    console.log(`Filtering data for tab: ${tabIdPrefix}, Start: ${startDate}, End: ${endDate}`);
    
    if (tabIdPrefix === 'requisitionManagement') {
        loadAndDisplayRequisitions();
    } else if (tabIdPrefix === 'requisitionApproval') {
        loadAndDisplayPendingApprovals();
    } else if (tabIdPrefix === 'goodsReceiving') {
        loadAndDisplayApprovedRequisitionsForReceiving();
    } else if (tabIdPrefix === 'dispenseMedicine') {
        loadAndDisplayDispenseHistory();
    }
}
