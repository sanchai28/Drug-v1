// medicines.js

/**
 * Fetches and displays the list of medicines in the table, filtered by user's hcode if applicable.
 * Assumes API_BASE_URL, fetchData, openEditMedicineModal, confirmToggleMedicineStatus, currentUser are globally available.
 */
async function loadAndDisplayMedicines() {
    const tableBody = document.getElementById("medicineMasterTableBody");
    if (!tableBody) {
        console.error("Table body for medicines not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลยา...</td></tr>'; // Updated colspan

    if (!currentUser) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-red-500 py-4">ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่</td></tr>'; // Updated colspan
        console.warn("Cannot load medicines: currentUser is not defined.");
        return;
    }

    let endpoint = '/medicines';
    const params = new URLSearchParams();

    if (currentUser.hcode) {
        params.append('hcode', currentUser.hcode);
    } else if (currentUser.role !== 'ผู้ดูแลระบบ') {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-orange-500 py-4">ไม่สามารถโหลดข้อมูลยาได้: ไม่พบรหัสหน่วยบริการผู้ใช้</td></tr>'; // Updated colspan
        console.warn("Cannot load medicines: User hcode not available for non-admin.");
        return;
    }
    
    if (params.toString()) {
        endpoint += `?${params.toString()}`;
    } else if (currentUser.role !== 'ผู้ดูแลระบบ') { 
         tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-orange-500 py-4">กรุณาระบุหน่วยบริการเพื่อดูรายการยา</td></tr>'; // Updated colspan
        return;
    }


    try {
        const medicines = await fetchData(endpoint); 
        tableBody.innerHTML = ''; 

        if (!medicines || medicines.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-gray-500 py-4">ไม่พบข้อมูลยาสำหรับหน่วยบริการ ${currentUser.hcode || '(ไม่ได้ระบุ)'}</td></tr>`; // Updated colspan
            return;
        }

        medicines.forEach(med => {
            const row = tableBody.insertRow();
            const medJsonString = JSON.stringify(med).replace(/"/g, "&quot;").replace(/'/g, "&apos;");

            row.innerHTML = `
                <td>${med.medicine_code || '-'}</td>
                <td>${med.generic_name}</td>
                <td>${med.strength || '-'}</td>
                <td>${med.unit}</td>
                <td class="text-center">${med.reorder_point || 0}</td>
                <td class="text-center">${med.min_stock || 0}</td>
                <td class="text-center">${med.max_stock || 0}</td>
                <td class="text-center">${med.lead_time_days || 0}</td>
                <td class="text-center">${med.review_period_days || 0}</td>
                <td>
                    <button onclick='openEditMedicineModal(${medJsonString})' class="btn btn-warning btn-sm text-xs px-2 py-1 mr-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-pencil-square mr-1" viewBox="0 0 16 16"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zM13.5 4.5L11.5 2.5 4.71 9.29a1.5 1.5 0 0 0-.426 1.061l-.433 2.596a.5.5 0 0 0 .64.64l2.596-.433a1.5 1.5 0 0 0 1.06-.426zM1.5 12.5A1.5 1.5 0 0 0 3 14h10a1.5 1.5 0 0 0 1.5-1.5V6.854L13.5 5.304V4.5h-1v.804L11.5 4.304V3.5h-1v.804L9.5 3.304V2.5h-1v.804L7.5 2.304V1.5h-1v.804L5.5 1.304V.5H4.459L3 1.959V3.5h-.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h.5v.5a.5.5 0 0 0 .5.5H3a.5.5 0 0 0 .5-.5V13h10.5a.5.5 0 0 0 .5.5h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H13v-1.146A1.5 1.5 0 0 0 11.5 11h-10A1.5 1.5 0 0 0 0 12.5v2A1.5 1.5 0 0 0 1.5 16h13a1.5 1.5 0 0 0 1.5-1.5v-2A1.5 1.5 0 0 0 14.5 11H13V9.5a.5.5 0 0 0-.5-.5H1.5a.5.5 0 0 0-.5.5v3z"/></svg>
                        แก้ไข
                    </button>
                    </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลยา</td></tr>'; // Updated colspan
    }
}

/**
 * Opens a modal to add a new medicine for the current user's hcode.
 */
function openAddMedicineModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modalTitle || !modalBody || !currentUser ) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลผู้ใช้งานปัจจุบัน กรุณาเข้าสู่ระบบใหม่', 'error');
        console.error("Modal elements not found or currentUser is missing for adding medicine.");
        return;
    }
    if (!currentUser.hcode && currentUser.role !== 'ผู้ดูแลระบบ') {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มยาได้: ไม่พบรหัสหน่วยบริการของผู้ใช้ปัจจุบัน', 'error');
        return;
    }
    const hcodeForNewMedicine = currentUser.hcode;
    if (!hcodeForNewMedicine && currentUser.role === 'ผู้ดูแลระบบ') {
         Swal.fire('แจ้งเตือน', 'ผู้ดูแลระบบ: กรุณาเลือกหน่วยบริการที่จะเพิ่มยา (ยังไม่รองรับการเพิ่มยาโดยไม่ระบุหน่วยบริการ)', 'info');
        return; 
    }


    modalTitle.textContent = `เพิ่มรายการยาใหม่ (สำหรับหน่วยบริการ: ${hcodeForNewMedicine})`;
    modalBody.innerHTML = `
        <form id="addMedicineForm">
            <input type="hidden" name="hcode" value="${hcodeForNewMedicine}">
            <div class="mb-4">
                <label for="addMedCode" class="label">รหัสยา (Medicine Code):</label>
                <input type="text" id="addMedCode" name="medicine_code" class="input-field" required>
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="mb-4">
                    <label for="addMinStock" class="label">Min Stock:</label>
                    <input type="number" id="addMinStock" name="min_stock" class="input-field" min="0" value="0">
                </div>
                <div class="mb-4">
                    <label for="addMaxStock" class="label">Max Stock:</label>
                    <input type="number" id="addMaxStock" name="max_stock" class="input-field" min="0" value="0">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="mb-4">
                    <label for="addLeadTimeDays" class="label">Lead Time (Days):</label>
                    <input type="number" id="addLeadTimeDays" name="lead_time_days" class="input-field" min="0" value="0">
                </div>
                <div class="mb-4">
                    <label for="addReviewPeriodDays" class="label">Review Period (Days):</label>
                    <input type="number" id="addReviewPeriodDays" name="review_period_days" class="input-field" min="0" value="0">
                </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึก</button>
            </div>
        </form>
    `;
    openModal('formModal'); 

    const addMedicineForm = document.getElementById('addMedicineForm');
    if (addMedicineForm) {
        addMedicineForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const medicineData = Object.fromEntries(formData.entries());
            medicineData.reorder_point = parseInt(medicineData.reorder_point) || 0;
            medicineData.min_stock = parseInt(document.getElementById('addMinStock').value) || 0;
            medicineData.max_stock = parseInt(document.getElementById('addMaxStock').value) || 0;
            medicineData.lead_time_days = parseInt(document.getElementById('addLeadTimeDays').value) || 0;
            medicineData.review_period_days = parseInt(document.getElementById('addReviewPeriodDays').value) || 0;

            try {
                const responseData = await fetchData('/medicines', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(medicineData)
                });
                Swal.fire('สำเร็จ', responseData.message || 'เพิ่มข้อมูลยาใหม่เรียบร้อยแล้ว', 'success');
                closeModal('formModal'); 
                if (typeof loadAndDisplayMedicines === 'function') loadAndDisplayMedicines(); 
            } catch (error) {
                // Error handled by fetchData
            }
        });
    }
}

/**
 * Opens a modal to edit an existing medicine, ensuring hcode context.
 * @param {object} medicineData - The data of the medicine to edit (should include hcode and id).
 */
function openEditMedicineModal(medicineData) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (!modalTitle || !modalBody || !currentUser) {
        console.error("Modal elements or currentUser not found for editing medicine.");
        return;
    }
    
    if (currentUser.role !== 'ผู้ดูแลระบบ' && currentUser.hcode !== medicineData.hcode) {
        Swal.fire('ไม่ได้รับอนุญาต', 'คุณไม่มีสิทธิ์แก้ไขข้อมูลยานี้', 'error');
        return;
    }
    
    modalTitle.textContent = `แก้ไขข้อมูลยา: ${medicineData.medicine_code} (หน่วยบริการ: ${medicineData.hcode})`;
    modalBody.innerHTML = `
        <form id="editMedicineForm">
            <input type="hidden" name="id" value="${medicineData.id}">
            <input type="hidden" name="hcode" value="${medicineData.hcode}"> 
            <div class="mb-4">
                <label for="editMedCode" class="label">รหัสยา (Medicine Code):</label>
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="mb-4">
                    <label for="editMinStock" class="label">Min Stock:</label>
                    <input type="number" id="editMinStock" name="min_stock" class="input-field" value="${medicineData.min_stock || 0}" min="0">
                </div>
                <div class="mb-4">
                    <label for="editMaxStock" class="label">Max Stock:</label>
                    <input type="number" id="editMaxStock" name="max_stock" class="input-field" value="${medicineData.max_stock || 0}" min="0">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="mb-4">
                    <label for="editLeadTimeDays" class="label">Lead Time (Days):</label>
                    <input type="number" id="editLeadTimeDays" name="lead_time_days" class="input-field" value="${medicineData.lead_time_days || 0}" min="0">
                </div>
                <div class="mb-4">
                    <label for="editReviewPeriodDays" class="label">Review Period (Days):</label>
                    <input type="number" id="editReviewPeriodDays" name="review_period_days" class="input-field" value="${medicineData.review_period_days || 0}" min="0">
                </div>
            </div>
            <div class="mb-4">
                <label for="editIsActive" class="label">สถานะการใช้งาน:</label>
                <select id="editIsActive" name="is_active" class="input-field">
                    <option value="true" ${medicineData.is_active ? 'selected' : ''}>ใช้งาน</option>
                    <option value="false" ${!medicineData.is_active ? 'selected' : ''}>ไม่ใช้งาน</option>
                </select>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
            </div>
        </form>
    `;
    openModal('formModal');

    const editMedicineForm = document.getElementById('editMedicineForm');
    if (editMedicineForm) {
        editMedicineForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const updatedMedicineData = Object.fromEntries(formData.entries());
            updatedMedicineData.reorder_point = parseInt(updatedMedicineData.reorder_point) || 0;
            updatedMedicineData.min_stock = parseInt(document.getElementById('editMinStock').value) || 0;
            updatedMedicineData.max_stock = parseInt(document.getElementById('editMaxStock').value) || 0;
            updatedMedicineData.lead_time_days = parseInt(document.getElementById('editLeadTimeDays').value) || 0;
            updatedMedicineData.review_period_days = parseInt(document.getElementById('editReviewPeriodDays').value) || 0;
            updatedMedicineData.is_active = updatedMedicineData.is_active === 'true'; 
            const medicineId = updatedMedicineData.id; 

            if (currentUser && currentUser.hcode) { // Add context for backend permission check if needed
                updatedMedicineData.hcode_context = currentUser.hcode;
            }

            try {
                const responseData = await fetchData(`/medicines/${medicineId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedMedicineData)
                });
                Swal.fire('สำเร็จ', responseData.message || `แก้ไขข้อมูลยาเรียบร้อยแล้ว`, 'success');
                closeModal('formModal');
                if (typeof loadAndDisplayMedicines === 'function') loadAndDisplayMedicines(); 
            } catch (error) {
                // Error handled by fetchData
            }
        });
    }
}

/**
 * Confirms and handles toggling the active status of a medicine for a specific hcode.
 * @param {number} medicineId - The ID of the medicine record (which is unique and tied to an hcode).
 * @param {string} medicineName - The name of the medicine for confirmation message.
 * @param {boolean} currentIsActive - The current active status of the medicine.
 */
async function confirmToggleMedicineStatus(medicineId, medicineName, currentIsActive) {
    const actionText = currentIsActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน';
    const newStatus = !currentIsActive;

    Swal.fire({
        title: `ยืนยันการ${actionText}`,
        text: `คุณต้องการ${actionText}ยา ${medicineName} (ID: ${medicineId}) สำหรับหน่วยบริการนี้ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: currentIsActive ? '#d33' : '#28a745',
        cancelButtonColor: '#6b7280',
        confirmButtonText: `ใช่, ${actionText}!`,
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const responseData = await fetchData(`/medicines/${medicineId}/toggle_active`, { 
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: newStatus }) 
                });
                Swal.fire('สำเร็จ!', responseData.message || `ยา ${medicineName} ถูก${actionText}แล้ว.`, 'success');
                if (typeof loadAndDisplayMedicines === 'function') loadAndDisplayMedicines(); 
            } catch (error) {
                // Error handled by fetchData
            }
        }
    });
}

// Add event listener for the new Min/Max calculation button
document.addEventListener('DOMContentLoaded', () => {
    const calcButton = document.getElementById('calculateMinMaxButton');
    if (calcButton) {
        calcButton.addEventListener('click', handleCalculateMinMax);
    }
});

async function handleCalculateMinMax() {
    if (!currentUser || !currentUser.hcode) {
        Swal.fire('Error', 'User information not found or HCODE is missing. Please log in again.', 'error');
        return;
    }

    const calculationPeriodInput = document.getElementById('calculationPeriodDays');
    const calculation_period_days = parseInt(calculationPeriodInput.value) || 90;

    if (calculation_period_days <= 0) {
        Swal.fire('Invalid Input', 'Calculation period must be a positive number of days.', 'warning');
        return;
    }

    const confirmation = await Swal.fire({
        title: 'Confirm Calculation',
        text: `This will recalculate Min/Max stock levels for ALL active medicines in your unit (${currentUser.hcode}) using a ${calculation_period_days}-day consumption period. This may overwrite existing manual Min/Max values. Proceed?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, Calculate!',
        cancelButtonText: 'Cancel'
    });

    if (confirmation.isConfirmed) {
        Swal.fire({
            title: 'Calculating...',
            text: 'Please wait while Min/Max stock levels are being updated.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const payload = {
                hcode: currentUser.hcode,
                calculation_period_days: calculation_period_days
                // medicine_id is omitted to calculate for all
            };

            // Assuming fetchData is a global function that handles API calls and errors
            // and returns parsed JSON response or throws an error.
            const responseData = await fetchData('/inventory/calculate-min-max', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            Swal.fire('Success!', responseData.message || 'Min/Max stock levels calculated successfully.', 'success');
            
            if (typeof loadAndDisplayMedicines === 'function') {
                loadAndDisplayMedicines(); // Refresh the table to show new Min/Max values
            }

        } catch (error) {
            console.error('Error calculating Min/Max stock:', error);
            Swal.fire('Error', error.message || 'An error occurred during calculation.', 'error');
        }
    }
}
