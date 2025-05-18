// unitservice.js

/**
 * Fetches and displays the list of unit services in the table.
 * Assumes API_BASE_URL, fetchData, openEditUnitServiceModal, confirmDeleteUnitService are globally available.
 */
async function loadAndDisplayUnitServices() {
    const tableBody = document.getElementById("unitServiceTableBody");
    if (!tableBody) {
        console.error("Table body for unit services not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลหน่วยบริการ...</td></tr>';
    try {
        // Assumes fetchData is globally available from utils.js
        const unitServices = await fetchData('/unitservices'); 
        tableBody.innerHTML = ''; 

        if (!unitServices || unitServices.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-gray-500 py-4">ไม่พบข้อมูลหน่วยบริการ</td></tr>';
            return;
        }

        unitServices.forEach(service => {
            const row = tableBody.insertRow();
            // Ensure service object is correctly stringified for onclick event
            const serviceJsonString = JSON.stringify(service).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
            row.innerHTML = `
                <td>${service.hcode}</td>
                <td>${service.name}</td>
                <td>
                    <button onclick='openEditUnitServiceModal(${serviceJsonString})' class="btn btn-warning btn-sm text-xs px-2 py-1 mr-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-pencil-square mr-1" viewBox="0 0 16 16"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zM13.5 4.5L11.5 2.5 4.71 9.29a1.5 1.5 0 0 0-.426 1.061l-.433 2.596a.5.5 0 0 0 .64.64l2.596-.433a1.5 1.5 0 0 0 1.06-.426zM1.5 12.5A1.5 1.5 0 0 0 3 14h10a1.5 1.5 0 0 0 1.5-1.5V6.854L13.5 5.304V4.5h-1v.804L11.5 4.304V3.5h-1v.804L9.5 3.304V2.5h-1v.804L7.5 2.304V1.5h-1v.804L5.5 1.304V.5H4.459L3 1.959V3.5h-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h.5v.5a.5.5 0 0 0 .5.5H3a.5.5 0 0 0 .5-.5V13h10.5a.5.5 0 0 0 .5.5h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H13v-1.146A1.5 1.5 0 0 0 11.5 11h-10A1.5 1.5 0 0 0 0 12.5v2A1.5 1.5 0 0 0 1.5 16h13a1.5 1.5 0 0 0 1.5-1.5v-2A1.5 1.5 0 0 0 14.5 11H13V9.5a.5.5 0 0 0-.5-.5H1.5a.5.5 0 0 0-.5.5v3z"/></svg>
                        แก้ไข
                    </button>
                    <button onclick="confirmDeleteUnitService('${service.hcode}', '${service.name}')" class="btn btn-danger btn-sm text-xs px-2 py-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-trash3-fill mr-1" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>
                        ลบ
                    </button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลหน่วยบริการ</td></tr>';
    }
}

/**
 * Opens a modal to add a new unit service.
 * Assumes openModal, closeModal, fetchData, loadAndDisplayUnitServices are globally available.
 */
function openAddUnitServiceModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modalTitle || !modalBody) {
        console.error("Modal title or body element not found for adding unit service.");
        return;
    }
    
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

    const addForm = document.getElementById('addUnitServiceForm');
    if (addForm) {
        addForm.addEventListener('submit', async function(e) {
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
                if (typeof loadAndDisplayUnitServices === 'function') loadAndDisplayUnitServices(); 
            } catch (error) {
                // Error is handled by fetchData, which shows a Swal.
            }
        });
    }
}

/**
 * Opens a modal to edit an existing unit service.
 * @param {object} serviceData - The data of the unit service to edit.
 * Assumes openModal, closeModal, fetchData, loadAndDisplayUnitServices are globally available.
 */
function openEditUnitServiceModal(serviceData) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modalTitle || !modalBody) {
        console.error("Modal elements not found for editing unit service.");
        return;
    }
    
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

    const editForm = document.getElementById('editUnitServiceForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
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
                if (typeof loadAndDisplayUnitServices === 'function') loadAndDisplayUnitServices(); 
            } catch (error) {
                // Error handled by fetchData
            }
        });
    }
}

/**
 * Confirms and handles the deletion of a unit service.
 * @param {string} hcode - The HCODE of the unit service to delete.
 * @param {string} name - The name of the unit service for confirmation message.
 * Assumes Swal, fetchData, loadAndDisplayUnitServices are globally available.
 */
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
                if (typeof loadAndDisplayUnitServices === 'function') loadAndDisplayUnitServices(); 
            } catch (error) {
                // Error handled by fetchData
            }
        }
    });
}
