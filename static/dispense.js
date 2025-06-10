// dispense.js
// Global variable to store previewed items for confirmation
let excelDispensePreviewData = null;
/**
 * Loads and displays the history of dispensed medicine records for the current user's hcode.
 */
async function loadAndDisplayDispenseHistory() {
    const tableBody = document.getElementById("dispenseHistoryTableBody");
    if (!tableBody) {
        console.error("Table body for dispense history not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดประวัติการตัดจ่ายยา...</td></tr>'; // Updated colspan to 5

    if (!currentUser) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่</td></tr>';
        console.warn("Cannot load dispense history: currentUser is not defined.");
        return;
    }

    const startDate = document.getElementById('startDateDisp').value;
    const endDate = document.getElementById('endDateDisp').value;
    
    const params = new URLSearchParams();
    if (currentUser.hcode) {
        params.append('hcode', currentUser.hcode);
    } else if (currentUser.role !== 'ผู้ดูแลระบบ') { 
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-orange-500 py-4">ไม่สามารถโหลดประวัติการตัดจ่ายยาได้: ไม่พบรหัสหน่วยบริการผู้ใช้</td></tr>';
        return;
    }
    if (currentUser.role) params.append('user_role', currentUser.role); 
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    let endpoint = `/dispense_records?${params.toString()}`;

    try {
        const dispenseHistory = await fetchData(endpoint); 
        tableBody.innerHTML = ''; 

        if (!dispenseHistory || dispenseHistory.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบประวัติการตัดจ่ายยา${currentUser.hcode ? 'สำหรับหน่วยบริการ ' + currentUser.hcode : ''} ในช่วงวันที่ที่เลือก</td></tr>`;
            return;
        }

        dispenseHistory.forEach(record => {
            const row = tableBody.insertRow();
            // Ensure record object is correctly stringified for onclick event
            const recordJsonString = JSON.stringify(record).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
            const statusText = record.status === 'ยกเลิก' ? 'ยกเลิกแล้ว' : (record.status === 'ปรับปรุงจาก Excel' ? 'ปรับปรุงจาก Excel' : 'ปกติ');
            let statusClass = '';
            if (record.status === 'ยกเลิก') {
                statusClass = 'text-red-500 font-semibold';
            } else if (record.status === 'ปรับปรุงจาก Excel') {
                statusClass = 'text-blue-500 font-semibold';
            }


            row.innerHTML = `
                <td>${record.dispense_record_number || `DSP-${record.id}`}</td>
                <td class="${statusClass}">${record.dispense_date} ${record.status !== 'ปกติ' ? `(${statusText})` : ''}</td>
                <td>${record.dispenser_name}</td>
                <td class="text-center">${record.item_count || 0}</td>
                <td>
                    <button onclick='viewDispenseDetails(${record.id}, ${recordJsonString})' 
                            class="btn btn-secondary btn-sm text-xs px-2 py-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-search mr-1" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
                        ดูรายละเอียด
                    </button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดประวัติการตัดจ่ายยา</td></tr>';
    }
}

/**
 * Opens a modal for manually dispensing medicine using FEFO.
 */
function openManualDispenseModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลผู้ใช้งานปัจจุบัน กรุณาเข้าสู่ระบบใหม่', 'error');
        return;
    }
    if (!currentUser.hcode && currentUser.role !== 'ผู้ดูแลระบบ') { 
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถตัดจ่ายยาได้: ไม่พบรหัสหน่วยบริการของผู้ใช้ปัจจุบัน', 'error');
        return;
    }
    const hcodeForDispense = currentUser.hcode || '';
    if (!hcodeForDispense && currentUser.role === 'ผู้ดูแลระบบ'){
        Swal.fire('แจ้งเตือน', 'ผู้ดูแลระบบ: กรุณาตรวจสอบว่ามีรหัสหน่วยบริการผูกกับบัญชีของท่านเพื่อดำเนินการนี้ หรือเลือกหน่วยบริการที่จะตัดจ่าย (ยังไม่รองรับ)', 'info');
        // return; 
    }

    modalTitle.textContent = `ตัดจ่ายยา (FEFO) - หน่วยบริการ: ${hcodeForDispense || 'N/A (Admin Global View - Not Implemented)'}`;
    modalBody.innerHTML = `
        <form id="manualDispenseForm">
            <input type="hidden" id="dispenserId" name="dispenser_id" value="${currentUser.id}">
            <input type="hidden" id="dispenseHcode" name="hcode" value="${hcodeForDispense}"> 
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <div class="mb-4">
                    <label for="dispenseDate" class="label">วันที่จ่าย:</label>
                    <input type="text" id="dispenseDate" name="dispense_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
                </div>
                <div class="mb-4">
                    <label for="dispenserNameDisplay" class="label">ผู้จ่ายยา:</label>
                    <input type="text" id="dispenserNameDisplay" name="dispenser_name_display" class="input-field bg-gray-100" value="${currentUser.full_name}" readonly>
                </div>
            </div>
            <div class="mb-4">
                <label for="dispenseType" class="label">ประเภทการจ่าย:</label>
                <select id="dispenseType" name="dispense_type" class="input-field">
                    <option value="ผู้ป่วยนอก" selected>ผู้ป่วยนอก</option>
                    <option value="หมดอายุ">หมดอายุ</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                </select>
            </div>
            <div class="mb-4">
                 <label for="dispenseRemarks" class="label">หมายเหตุการตัดจ่าย:</label>
                 <textarea id="dispenseRemarks" name="remarks" class="input-field" rows="2" placeholder="รายละเอียดเพิ่มเติม..."></textarea>
            </div>
            <hr class="my-6">
            <div class="mb-4">
                <label class="label">รายการยาที่จ่าย (ระบบจะเลือก Lot ตาม FEFO):</label>
                <div id="dispenseItemsContainer">
                    </div>
                <button type="button" class="btn btn-success btn-sm text-xs mt-2" 
                        onclick="addDynamicItemRowForDispense('dispenseItemsContainer', '${hcodeForDispense}')">
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
    addDynamicItemRowForDispense('dispenseItemsContainer', hcodeForDispense); 

    document.getElementById('manualDispenseForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const dispenseData = {
            dispense_date: formData.get('dispense_date'), 
            dispenser_id: parseInt(formData.get('dispenser_id')), 
            hcode: formData.get('hcode'), 
            dispense_type: formData.get('dispense_type'),
            remarks: formData.get('remarks'),
            items: []
        };

        if (!dispenseData.hcode && currentUser.role !== 'ผู้ดูแลระบบ') {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกการตัดจ่ายได้: ไม่พบรหัสหน่วยบริการ', 'error');
            return;
        }

        const itemRows = document.querySelectorAll('#dispenseItemsContainer > div');
        let allItemsValid = true;
        itemRows.forEach((row, index) => {
            const medIdInput = row.querySelector(`input[name="items[${index}][medicine_id]"]`);
            const qtyInput = row.querySelector(`input[name="items[${index}][quantity_dispensed]"]`);
            const hosGuidInput = row.querySelector(`input[name="items[${index}][hos_guid]"]`); // Optional for manual

            if (medIdInput && medIdInput.value && qtyInput && qtyInput.value) {
                 dispenseData.items.push({
                    medicine_id: parseInt(medIdInput.value),
                    quantity_dispensed: parseInt(qtyInput.value), // Backend will handle Lot and Expiry via FEFO
                    hos_guid: hosGuidInput ? hosGuidInput.value : null 
                });
            } else {
                if(medIdInput.value || qtyInput.value){ 
                    allItemsValid = false;
                }
            }
        });
        
        if (!allItemsValid || dispenseData.items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณากรอกข้อมูลรายการยา (รหัสยา และ จำนวน) ให้ครบถ้วน หรือเพิ่มรายการยาอย่างน้อย 1 รายการ', 'error');
            return;
        }

        try {
            const responseData = await fetchData('/dispense/manual', { // Endpoint remains the same, backend logic changes
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dispenseData)
            });
            Swal.fire('บันทึกสำเร็จ', responseData.message || 'ข้อมูลการตัดจ่ายยาได้รับการบันทึกแล้ว (FEFO)', 'success');
            closeModal('formModal');
            if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory(); 
            if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary(); 
        } catch (error) {
            // Error handled by fetchData (which shows a Swal)
        }
    });
}

/**
 * Adds a dynamic item row specifically for the FEFO dispense form (Manual).
 * Removes Lot and Expiry date inputs as they are handled by FEFO.
 */
function addDynamicItemRowForDispense(containerId, hcodeContext) {
    const itemsContainer = document.getElementById(containerId);
    if (!itemsContainer) return;
    const itemCount = itemsContainer.children.length;

    const newItemRow = document.createElement('div');
    newItemRow.className = 'flex items-center space-x-2 mb-2 animate-fadeIn relative';
    // Removed Lot select and Expiry date input
    // Added an optional hos_guid input for manual entry if needed for traceability
    newItemRow.innerHTML = `
        <input type="text" 
               placeholder="ค้นหารหัสยา/ชื่อยา" 
               class="input-field flex-grow !mb-0 medicine-search-input" 
               name="items[${itemCount}][medicine_display_name]" 
               oninput="handleMedicineSearch(event, ${itemCount}, '${hcodeContext}', null)"  
               onkeydown="navigateSuggestions(event, ${itemCount})"
               data-hcode-context="${hcodeContext}"
               data-row-index="${itemCount}"
               autocomplete="off"
               required>
        <input type="hidden" name="items[${itemCount}][medicine_id]">
        <div class="suggestions-box absolute top-full left-0 z-10 w-full bg-white border border-gray-300 rounded-md mt-1 shadow-lg hidden max-h-40 overflow-y-auto"></div>
        
        <input type="number" placeholder="จำนวน" class="input-field w-24 !mb-0" name="items[${itemCount}][quantity_dispensed]" min="1" required>
        <input type="text" placeholder="HOS GUID (ถ้ามี)" class="input-field w-40 !mb-0" name="items[${itemCount}][hos_guid]"> 
        
        <button type="button" class="btn btn-danger btn-sm text-xs !p-2" onclick="this.parentElement.remove()">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>
        </button>
    `;
    itemsContainer.appendChild(newItemRow);
    // No need to add event listeners for lot selection as it's removed for FEFO manual dispense
}

// fetchAndPopulateLotsForDispense is no longer needed for manual FEFO dispense.
// It might still be used by Excel preview if we want to show available lots, but the user won't select.
// For simplicity with FEFO, the Excel preview might just show "Stock Available (FEFO)" or "Insufficient Stock".

async function uploadDispenseExcel() {
    const fileInput = document.getElementById('excelUploadDispense');
    if (!fileInput || fileInput.files.length === 0) {
        Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกไฟล์ Excel ที่ต้องการอัปโหลด', 'error');
        return;
    }

    if (!currentUser || !currentUser.hcode || !currentUser.id) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถอัปโหลดได้: ไม่พบข้อมูลผู้ใช้หรือรหัสหน่วยบริการ', 'error');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('hcode', currentUser.hcode); 

    Swal.fire({
        title: 'กำลังอ่านไฟล์ Excel...',
        text: 'กรุณารอสักครู่ ระบบกำลังประมวลผลไฟล์เพื่อแสดงตัวอย่าง',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const response = await fetch(`${API_BASE_URL}/dispense/upload_excel/preview`, { 
            method: 'POST',
            body: formData,
        });

        const result = await response.json();
        Swal.close(); 

        if (!response.ok) {
            Swal.fire('เกิดข้อผิดพลาด', result.error || 'ไม่สามารถอ่านข้อมูลจากไฟล์ Excel ได้', 'error');
            fileInput.value = ''; 
            return;
        }

        if (result.preview_items && result.preview_items.length > 0) {
            excelDispensePreviewData = result.preview_items; 
            showDispenseExcelPreviewModal(result.preview_items);
        } else {
            Swal.fire('ไม่พบข้อมูล', 'ไม่พบรายการยาที่สามารถประมวลผลได้ในไฟล์ Excel', 'info');
            fileInput.value = ''; 
        }

    } catch (error) {
        Swal.close();
        console.error('Error previewing Excel file:', error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หรือประมวลผลไฟล์ตัวอย่างได้', 'error');
        fileInput.value = ''; 
    }
}

function showDispenseExcelPreviewModal(previewItems) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'ตรวจสอบรายการตัดจ่ายยาจาก Excel (FEFO)';
    let itemsHtml = `
        <div class="text-sm mb-4">
            <p>กรุณาตรวจสอบรายการด้านล่าง และแก้ไขวันที่/จำนวน หากจำเป็น ระบบจะจ่ายยาตามหลัก FEFO</p>
            <p class="text-orange-600"><b>หมายเหตุสถานะการนำเข้า:</b></p>
            <ul class="list-disc list-inside ml-4 text-xs">
                <li><span class="text-green-600 font-semibold">พร้อมจ่าย (FEFO) / รายการใหม่ (hos_guid):</span> ระบบจะพยายามจ่ายยาตามจำนวนนี้</li>
                <li><span class="text-blue-600 font-semibold">รายการซ้ำ (hos_guid) และจำนวนแตกต่าง:</span> ระบบจะยกเลิกรายการเก่าและสร้างรายการใหม่ด้วยจำนวนนี้ (ตาม FEFO)</li>
                <li><span class="text-gray-500 font-semibold">รายการซ้ำ (hos_guid) และจำนวนเท่าเดิม:</span> ระบบจะข้ามรายการนี้</li>
                <li><span class="text-red-600 font-semibold">มีข้อผิดพลาด / สต็อกไม่เพียงพอ:</span> ไม่สามารถดำเนินการได้</li>
            </ul>
        </div>
        <table class="custom-table text-xs sm:text-sm w-full">
            <thead>
                <tr>
                    <th>แถวที่</th>
                    <th>HOS GUID</th>
                    <th>วันที่จ่าย</th>
                    <th>รหัสยา</th>
                    <th>ชื่อยา</th>
                    <th>จำนวน</th>
                    <th>Lot ที่จะใช้ (FEFO)</th> 
                    <th>สถานะการนำเข้า</th>
                </tr>
            </thead>
            <tbody>`;

    previewItems.forEach((item, index) => {
        let rowClass = '';
        let inputsDisabled = false;
        let lotInfoDisplay = '<span class="text-gray-400">-</span>';

        if (item.status === "พร้อมจ่าย (FEFO)" || item.status === "รายการใหม่ (hos_guid)" || item.status.includes("จำนวนแตกต่าง")) {
            rowClass = item.status.includes("จำนวนแตกต่าง") ? 'bg-blue-50' : 'bg-green-50';
            if (item.available_lots_info_for_preview && item.available_lots_info_for_preview.length > 0) {
                lotInfoDisplay = item.available_lots_info_for_preview.join('<br>');
            } else if (item.status === "พร้อมจ่าย (FEFO)") { // Should have lot info if ready
                lotInfoDisplay = '<span class="text-orange-500">รอระบบเลือก Lot</span>';
            }
        } else if (item.status === "รายการซ้ำ (hos_guid) และจำนวนเท่าเดิม") {
            rowClass = 'bg-gray-200 opacity-70'; 
            inputsDisabled = true;
            lotInfoDisplay = '<span class="text-gray-400">จะถูกข้าม</span>';
        } else if (item.errors.length > 0 || item.status === "มีข้อผิดพลาด" || item.status.includes("สต็อกไม่เพียงพอ")) {
            rowClass = 'bg-red-100'; 
            inputsDisabled = true;
            lotInfoDisplay = '<span class="text-red-500">ไม่สามารถจ่ายได้</span>';
             if (item.available_lots_info_for_preview && item.available_lots_info_for_preview.length > 0) {
                lotInfoDisplay = `<span class="text-red-500">${item.available_lots_info_for_preview.join('<br>')}</span>`;
            }
        }

        let statusDisplayClass = '';
        if (item.errors.length > 0 || item.status === "มีข้อผิดพลาด" || item.status.includes("สต็อกไม่เพียงพอ")) statusDisplayClass = 'text-red-600 font-semibold';
        else if (item.status.includes("จำนวนแตกต่าง")) statusDisplayClass = 'text-blue-600 font-semibold';
        else if (item.status.includes("จำนวนเท่าเดิม")) statusDisplayClass = 'text-gray-600';
        else if (item.status === "พร้อมจ่าย (FEFO)" || item.status === "รายการใหม่ (hos_guid)") statusDisplayClass = 'text-green-600 font-semibold';
        else statusDisplayClass = 'text-gray-500';


        itemsHtml += `
            <tr data-item-index="${index}" class="${rowClass}">
                <td class="text-center">${item.row_num-1}</td>
                <td>${item.hos_guid || '-'}</td>
                <td><input type="text" id="excel-dispense-date-${index}" class="input-field !p-1 !text-xs !mb-0 thai-date-formatter" value="${item.dispense_date_str}" ${inputsDisabled ? 'disabled' : ''}></td>
                <td>${item.medicine_code}</td>
                <td>${item.medicine_name}</td>
                <td><input type="number" id="excel-quantity-${index}" class="input-field !p-1 !text-xs w-16 !mb-0" value="${item.quantity_requested_str}" min="1" ${inputsDisabled ? 'disabled' : ''}></td>
                <td class="text-xs">${lotInfoDisplay}</td> 
                <td class="${statusDisplayClass}">${item.errors.length > 0 ? item.errors.join('<br>') : item.status}</td>
            </tr>`;
    });

    itemsHtml += `</tbody></table>`;
    modalBody.innerHTML = `
        <form id="confirmDispenseExcelForm">
            ${itemsHtml}
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal'); document.getElementById('excelUploadDispense').value = ''; excelDispensePreviewData = null;">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">ยืนยันการตัดจ่าย</button>
            </div>
        </form>
    `;
    openModal('formModal');

    document.querySelectorAll(`#formModal .thai-date-formatter`).forEach(el => {
        if (typeof autoFormatThaiDateInput === 'function') {
            el.addEventListener('input', autoFormatThaiDateInput);
        }
    });

    document.getElementById('confirmDispenseExcelForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        confirmAndProcessExcelDispense();
    });
}

// updateLotExpiryForExcelPreview is no longer needed as user doesn't select lot for FEFO

async function confirmAndProcessExcelDispense() {
    if (!excelDispensePreviewData || !currentUser) {
        Swal.fire('ข้อผิดพลาด', 'ไม่มีข้อมูลตัวอย่างสำหรับการยืนยัน หรือไม่พบข้อมูลผู้ใช้', 'error');
        return;
    }

    const itemsToSubmit = [];
    let hasValidationError = false;

    excelDispensePreviewData.forEach((originalItem, index) => {
        // Skip items that are informational (skipped) or have errors from preview
        if (originalItem.status === "รายการซ้ำ (hos_guid) และจำนวนเท่าเดิม" || originalItem.status === "มีข้อผิดพลาด" || originalItem.errors.length > 0 || originalItem.status.includes("สต็อกไม่เพียงพอ")) {
            return; 
        }
        
        const quantityInput = document.getElementById(`excel-quantity-${index}`);
        const dateInput = document.getElementById(`excel-dispense-date-${index}`);
        const rowElement = document.querySelector(`tr[data-item-index="${index}"]`);
        if(rowElement) rowElement.classList.remove('border-2', 'border-red-500'); 


        if (quantityInput && dateInput) {
            const finalQuantityStr = quantityInput.value;
            const finalDateStr = dateInput.value;
            const finalDateIso = (typeof thai_to_iso_date_frontend === 'function') ? thai_to_iso_date_frontend(finalDateStr) : null;

            if (!finalDateIso) {
                Swal.fire('ข้อผิดพลาด', `รูปแบบวันที่ไม่ถูกต้องสำหรับรายการยา ${originalItem.medicine_code} (แถว Excel ${originalItem.row_num})`, 'error');
                if(rowElement) rowElement.classList.add('border-2', 'border-red-500');
                hasValidationError = true; return;
            }
            let finalQuantity;
            try {
                finalQuantity = parseInt(finalQuantityStr);
                if (isNaN(finalQuantity) || finalQuantity <= 0) throw new Error("จำนวนไม่ถูกต้อง");
            } catch (e) {
                Swal.fire('ข้อผิดพลาด', `จำนวนจ่ายไม่ถูกต้องสำหรับรายการยา ${originalItem.medicine_code} (แถว Excel ${originalItem.row_num})`, 'error');
                if(rowElement) rowElement.classList.add('border-2', 'border-red-500');
                hasValidationError = true; return;
            }

            // No lot selection by user, backend handles FEFO
            itemsToSubmit.push({
                row_num: originalItem.row_num,
                hos_guid: originalItem.hos_guid, 
                medicine_id: originalItem.medicine_id,
                medicine_code: originalItem.medicine_code, 
                // Lot and expiry will be determined by backend FEFO logic
                quantity_dispensed: finalQuantity,
                dispense_date_iso: finalDateIso 
            });
        }
    });

    if (hasValidationError) return; 

    if (itemsToSubmit.length === 0) {
        Swal.fire('ไม่มีรายการ', 'ไม่มีรายการยาที่พร้อมสำหรับการตัดจ่าย (อาจมีข้อผิดพลาด หรือเป็นรายการซ้ำที่จำนวนเท่าเดิมทั้งหมด)', 'info');
        closeModal('formModal');
        document.getElementById('excelUploadDispense').value = '';
        excelDispensePreviewData = null;
        return;
    }

    Swal.fire({
        title: 'ยืนยันการตัดจ่ายยา',
        text: `คุณต้องการยืนยันการตัดจ่ายยาทั้งหมด ${itemsToSubmit.length} รายการที่เลือกใช่หรือไม่? (ระบบจะจ่ายตาม FEFO)`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        allowOutsideClick: () => !Swal.isLoading(),
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'กำลังบันทึกการตัดจ่าย...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                const payload = {
                    dispenser_id: currentUser.id,
                    hcode: currentUser.hcode,
                    dispense_items: itemsToSubmit // Backend will handle FEFO based on this
                };
                const response = await fetch(`${API_BASE_URL}/dispense/process_excel_dispense`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const responseData = await response.json();

                let swalIcon, swalTitle, swalHtml;

                if (response.ok || response.status === 207) { 
                    swalIcon = 'success';
                    swalTitle = responseData.message || 'การตัดจ่ายยาจาก Excel สำเร็จ';
                    swalHtml = `ประมวลผลสำเร็จ: ${responseData.processed_count || 0} รายการ.<br>เอกสารตัดจ่ายเลขที่: <b>${responseData.dispense_record_number || 'N/A'}</b>`;

                    if (responseData.updated_hos_guids && responseData.updated_hos_guids.length > 0) {
                        swalHtml += `<br>อัปเดต (hos_guid): ${responseData.updated_hos_guids.length} รายการ.`;
                    }
                    if (responseData.skipped_hos_guids_same_qty && responseData.skipped_hos_guids_same_qty.length > 0) {
                        swalHtml += `<br>ข้ามรายการซ้ำ (hos_guid, จำนวนเท่าเดิม): ${responseData.skipped_hos_guids_same_qty.length} รายการ.`;
                    }

                    if (responseData.failed_details && responseData.failed_details.length > 0) {
                        swalIcon = responseData.processed_count > 0 ? 'warning' : 'error';
                        swalTitle = responseData.processed_count > 0 ? 'การตัดจ่ายสำเร็จบางส่วน!' : 'การตัดจ่ายล้มเหลว!';
                        swalHtml += `<br><br><b>พบข้อผิดพลาด ${responseData.failed_details.length} รายการที่ไม่ถูกบันทึก:</b><br><div style="max-height: 150px; overflow-y: auto; text-align: left; font-size: 0.9em; margin-top: 10px; padding: 5px; border: 1px solid #ddd; background-color: #f9f9f9;">`;
                        responseData.failed_details.forEach(fail => {
                            swalHtml += `ยา ${fail.medicine_code || (fail.hos_guid || 'N/A')} (Lot: ${fail.lot || 'N/A'}): ${fail.error}<br>`;
                        });
                        swalHtml += `</div>`;
                    }
                } else { 
                    swalIcon = 'error';
                    swalTitle = 'เกิดข้อผิดพลาด';
                    swalHtml = responseData.error || 'ไม่สามารถบันทึกการตัดจ่ายยาจาก Excel ได้';
                    if (responseData.details) { 
                        swalHtml += `<br><br><b>รายละเอียด:</b><br><div style="max-height: 150px; overflow-y: auto; text-align: left; font-size: 0.9em; margin-top: 10px; padding: 5px; border: 1px solid #ddd; background-color: #f9f9f9;">`;
                        responseData.details.forEach(fail => {
                             swalHtml += `ยา ${fail.medicine_code || (fail.hos_guid || 'N/A')} (Lot: ${fail.lot || 'N/A'}): ${fail.error}<br>`;
                        });
                        swalHtml += `</div>`;
                    }
                }
                Swal.fire({icon: swalIcon, title: swalTitle, html: swalHtml});
                if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory();
                if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary();
            } catch (error) {
                console.error('Error confirming excel dispense:', error);
                Swal.fire('เกิดข้อผิดพลาด', 'การเชื่อมต่อล้มเหลว หรือเกิดข้อผิดพลาดในการยืนยัน', 'error');
            } finally {
                closeModal('formModal');
                document.getElementById('excelUploadDispense').value = '';
                excelDispensePreviewData = null;
            }
        }
    });
}

async function viewDispenseDetails(recordId, recordHeaderDetails) { 
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser) return;

    if (typeof recordHeaderDetails === 'string') {
        try {
            recordHeaderDetails = JSON.parse(recordHeaderDetails.replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        } catch (e) {
            console.error("Error parsing recordHeaderDetails:", e, recordHeaderDetails);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแสดงรายละเอียดได้ (ข้อมูลผิดพลาด)', 'error');
            return;
        }
    }

    modalTitle.textContent = `รายละเอียดการตัดจ่ายยา: ${recordHeaderDetails.dispense_record_number || `DSP-${recordId}`}`;
    
    let statusText = 'ปกติ';
    let statusClass = 'text-green-600 font-semibold';
    if (recordHeaderDetails.status === 'ยกเลิก') {
        statusText = 'เอกสารนี้ถูกยกเลิกแล้ว';
        statusClass = 'text-red-600 font-semibold';
    } else if (recordHeaderDetails.status === 'ปรับปรุงจาก Excel') {
        statusText = 'เอกสารนี้มีการปรับปรุงรายการผ่าน Excel';
        statusClass = 'text-blue-600 font-semibold';
    }


    modalBody.innerHTML = `
            <div class="space-y-3 mb-4">
            <p><strong>เลขที่เอกสาร:</strong> ${recordHeaderDetails.dispense_record_number || `DSP-${recordId}`}</p>
            <p><strong>วันที่จ่าย:</strong> ${recordHeaderDetails.dispense_date}</p> 
            <p><strong>ผู้จ่ายยา:</strong> ${recordHeaderDetails.dispenser_name}</p>
            <p><strong>ประเภทการจ่าย:</strong> ${recordHeaderDetails.dispense_type || '-'}</p>
            <p><strong>จ่ายจากหน่วยบริการ:</strong> ${recordHeaderDetails.hcode || currentUser.hcode || 'N/A'}</p>
            <p><strong>หมายเหตุเอกสาร:</strong> ${recordHeaderDetails.remarks || '-'}</p>
            <p id="dispenseStatusText" class="${statusClass}">สถานะ: ${statusText}</p>
        </div>
        <p class="text-sm text-blue-600 my-3">หากต้องการแก้ไขรายการยา กรุณายกเลิกเอกสารนี้และสร้างใหม่</p>
        <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่จ่าย (สถานะปกติ):</h4>
        <div class="overflow-x-auto" id="dispenseDetailItemsContainerModal">
            <p class="text-center text-gray-400 py-3">กำลังโหลดรายการยา...</p>
        </div>
        <div class="flex justify-end mt-6 space-x-3" id="dispenseModalActionButtons">
            ${recordHeaderDetails.status !== 'ยกเลิก' ? 
            `<button type="button" class="btn btn-warning" onclick='openEditDispenseRecordModal(${recordId})'>แก้ไขข้อมูลเอกสาร</button>
             <button type="button" class="btn btn-danger" onclick="confirmCancelDispenseRecord(${recordId}, '${recordHeaderDetails.dispense_record_number || `DSP-${recordId}`}')">ยกเลิกการตัดจ่าย</button>`
            : ''}
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal');

    const itemsContainer = document.getElementById('dispenseDetailItemsContainerModal');
    try {
        const items = await fetchData(`/dispense_records/${recordId}/items`); 
        let itemsTableHtml = `
            <table class="custom-table text-sm">
                <thead>
                    <tr>
                        <th>รหัสยา</th>
                        <th>ชื่อยา</th>
                        <th>Lot No.</th>
                        <th>วันหมดอายุ</th>
                        <th class="text-center">จำนวนจ่าย</th>
                        <th>HOS GUID</th>
                    </tr>
                </thead>
                <tbody>`;
        if (items && items.length > 0) {
            items.forEach(item => {
                itemsTableHtml += `
                    <tr>
                        <td>${item.medicine_code || '-'}</td>
                        <td>${item.generic_name} ${item.strength || ''}</td>
                        <td>${item.lot_number}</td>
                        <td>${item.expiry_date}</td> 
                        <td class="text-center">${item.quantity_dispensed}</td>
                        <td>${item.hos_guid || '-'}</td>
                    </tr>
                `;
            });
        } else {
            itemsTableHtml += '<tr><td colspan="6" class="text-center text-gray-500 py-3">ไม่พบรายการยา (สถานะปกติ) ในเอกสารนี้</td></tr>';
        }
        itemsTableHtml += '</tbody></table>';
        itemsContainer.innerHTML = itemsTableHtml;
    } catch (error) {
        itemsContainer.innerHTML = '<p class="text-center text-red-500 py-3">เกิดข้อผิดพลาดในการโหลดรายการยา</p>';
    }
}

/**
 * Opens a modal to edit the header of a dispense record.
 * @param {number} recordId - The ID of the dispense record to edit.
 */
async function openEditDispenseRecordModal(recordId) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser) return;

    modalBody.innerHTML = `<p class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลเอกสารตัดจ่าย...</p>`;
    if (document.getElementById('formModal').classList.contains('active')) {
        closeModal('formModal'); 
        await new Promise(resolve => setTimeout(resolve, 350)); 
    }
    openModal('formModal');

    try {
        const recordData = await fetchData(`/dispense_records/${recordId}`);
        if (!recordData) {
            closeModal('formModal');
            return; 
        }
        if (recordData.status === 'ยกเลิก') {
            Swal.fire('ไม่สามารถแก้ไขได้', 'เอกสารตัดจ่ายนี้ถูกยกเลิกไปแล้ว ไม่สามารถแก้ไขได้', 'warning');
            closeModal('formModal');
            return;
        }
         if (recordData.status === 'ปรับปรุงจาก Excel') {
            Swal.fire('ไม่สามารถแก้ไขได้', 'เอกสารนี้มีการปรับปรุงรายการผ่าน Excel แล้ว หากต้องการแก้ไข กรุณายกเลิกและสร้างใหม่', 'warning');
            closeModal('formModal');
            return;
        }


        modalTitle.textContent = `แก้ไขข้อมูลเอกสารตัดจ่าย: ${recordData.dispense_record_number || `DSP-${recordId}`}`;
        modalBody.innerHTML = `
            <form id="editDispenseRecordForm">
                <input type="hidden" name="record_id" value="${recordId}">
                <div class="mb-4">
                    <label for="editDispenseDate" class="label">วันที่จ่าย:</label>
                    <input type="text" id="editDispenseDate" name="dispense_date" class="input-field thai-date-formatter" value="${recordData.dispense_date_thai}" required>
                </div>
                <div class="mb-4">
                    <label for="editDispenseType" class="label">ประเภทการจ่าย:</label>
                    <select id="editDispenseType" name="dispense_type" class="input-field">
                        <option value="ผู้ป่วยนอก" ${recordData.dispense_type === 'ผู้ป่วยนอก' ? 'selected' : ''}>ผู้ป่วยนอก</option>
                        <option value="หมดอายุ" ${recordData.dispense_type === 'หมดอายุ' ? 'selected' : ''}>หมดอายุ</option>
                        <option value="อื่นๆ" ${recordData.dispense_type === 'อื่นๆ' ? 'selected' : ''}>อื่นๆ</option>
                         <option value="ผู้ป่วยนอก (Excel)" ${recordData.dispense_type === 'ผู้ป่วยนอก (Excel)' ? 'selected' : ''}>ผู้ป่วยนอก (Excel)</option>
                        <option value="อื่นๆ (Excel)" ${recordData.dispense_type === 'อื่นๆ (Excel)' ? 'selected' : ''}>อื่นๆ (Excel)</option>
                    </select>
                </div>
                <div class="mb-4">
                    <label for="editDispenseRemarks" class="label">หมายเหตุ:</label>
                    <textarea id="editDispenseRemarks" name="remarks" class="input-field" rows="3">${recordData.remarks || ''}</textarea>
                </div>
                <p class="text-sm text-yellow-600 my-4">หมายเหตุ: การแก้ไขรายการยาในเอกสารนี้ยังไม่รองรับ กรุณายกเลิกและสร้างใหม่หากต้องการแก้ไขรายการยา</p>
                <div class="flex justify-end space-x-3 mt-6">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
                </div>
            </form>
        `;

        document.getElementById('editDispenseRecordForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const updatedData = {
                dispense_date: formData.get('dispense_date'),
                dispense_type: formData.get('dispense_type'),
                remarks: formData.get('remarks')
            };
            try {
                const responseData = await fetchData(`/dispense_records/${recordId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                });
                Swal.fire('สำเร็จ!', responseData.message || 'อัปเดตข้อมูลเอกสารตัดจ่ายเรียบร้อยแล้ว', 'success');
                closeModal('formModal');
                if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory();
            } catch (error) { /* Handled by fetchData */ }
        });
    } catch (error) {
        modalBody.innerHTML = `<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลเอกสารตัดจ่าย</p>`;
    }
}

/**
 * Confirms and handles the cancellation of a dispense record.
 * @param {number} recordId - The ID of the dispense record to cancel.
 * @param {string} recordNumber - The number of the dispense record for confirmation.
 */
async function confirmCancelDispenseRecord(recordId, recordNumber) {
    if (!currentUser || !currentUser.id) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ไม่พบข้อมูลผู้ใช้งาน', 'error');
        return;
    }
    Swal.fire({
        title: 'ยืนยันการยกเลิกการตัดจ่าย',
        html: `คุณต้องการยกเลิกเอกสารตัดจ่าย <b>${recordNumber || `ID ${recordId}`}</b> ใช่หรือไม่?<br><strong class="text-blue-600">การดำเนินการนี้จะพยายามคืนสต็อกยาเข้าคลังโดยอัตโนมัติ</strong><br><small>(กรุณาตรวจสอบความถูกต้องของสต็อกหลังดำเนินการ)</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ยกเลิกเลย!',
        cancelButtonText: 'ไม่'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const responseData = await fetchData(`/dispense_records/${recordId}?user_id_context=${currentUser.id}`, { method: 'DELETE' }); 
                Swal.fire('สำเร็จ!', responseData.message || `เอกสารตัดจ่าย ${recordNumber || `ID ${recordId}`} ถูกยกเลิกแล้ว และมีการปรับปรุงสต็อก.`, 'success');
                
                closeModal('formModal'); 

                if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory(); 
                if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary(); 
            } catch (error) { /* Handled by fetchData */ }
        }
    });
}
