// dispense.js

/**
 * Loads and displays the history of dispensed medicine records for the current user's hcode.
 */
async function loadAndDisplayDispenseHistory() {
    const tableBody = document.getElementById("dispenseHistoryTableBody");
    if (!tableBody) {
        console.error("Table body for dispense history not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">กำลังโหลดประวัติการตัดจ่ายยา...</td></tr>';

    if (!currentUser) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-red-500 py-4">ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่</td></tr>';
        console.warn("Cannot load dispense history: currentUser is not defined.");
        return;
    }

    const startDate = document.getElementById('startDateDisp').value;
    const endDate = document.getElementById('endDateDisp').value;
    
    const params = new URLSearchParams();
    if (currentUser.hcode) {
        params.append('hcode', currentUser.hcode);
    } else if (currentUser.role !== 'ผู้ดูแลระบบ') { 
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-orange-500 py-4">ไม่สามารถโหลดประวัติการตัดจ่ายยาได้: ไม่พบรหัสหน่วยบริการผู้ใช้</td></tr>';
        return;
    }
    // For admin without hcode, API will decide (current API requires hcode for non-admin)
    if (currentUser.role) params.append('user_role', currentUser.role); // Send role for backend logic if needed
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    let endpoint = `/dispense_records?${params.toString()}`;

    try {
        const dispenseHistory = await fetchData(endpoint); 
        tableBody.innerHTML = ''; 

        if (!dispenseHistory || dispenseHistory.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-4">ไม่พบประวัติการตัดจ่ายยา${currentUser.hcode ? 'สำหรับหน่วยบริการ ' + currentUser.hcode : ''} ในช่วงวันที่ที่เลือก</td></tr>`;
            return;
        }

        dispenseHistory.forEach(record => {
            const row = tableBody.insertRow();
            const recordJsonString = JSON.stringify(record).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
            const statusText = record.status === 'ยกเลิก' ? 'ยกเลิกแล้ว' : 'ปกติ';
            const statusClass = record.status === 'ยกเลิก' ? 'text-red-500 font-semibold' : '';


            row.innerHTML = `
                <td>${record.dispense_record_number || `DSP-${record.id}`}</td>
                <td class="${statusClass}">${record.dispense_date} ${record.status === 'ยกเลิก' ? '(ยกเลิก)' : ''}</td>
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
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดประวัติการตัดจ่ายยา</td></tr>';
    }
}

/**
 * Opens a modal for manually dispensing medicine.
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

    modalTitle.textContent = `ตัดจ่ายยา (กรอกข้อมูลเอง) - หน่วยบริการ: ${hcodeForDispense || 'N/A (Admin Global View - Not Implemented)'}`;
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
                    <option value="ผู้ป่วยใน">ผู้ป่วยใน</option>
                    <option value="หน่วยงานภายใน">หน่วยงานภายใน</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                </select>
            </div>
            <div class="mb-4">
                 <label for="dispenseRemarks" class="label">หมายเหตุการตัดจ่าย:</label>
                 <textarea id="dispenseRemarks" name="remarks" class="input-field" rows="2" placeholder="รายละเอียดเพิ่มเติม..."></textarea>
            </div>
            <hr class="my-6">
            <div class="mb-4">
                <label class="label">รายการยาที่จ่าย:</label>
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
            const lotSelect = row.querySelector(`select[name="items[${index}][lot_number]"]`);
            const expDateInput = row.querySelector(`input[name="items[${index}][expiry_date]"]`);
            const qtyInput = row.querySelector(`input[name="items[${index}][quantity_dispensed]"]`);

            if (medIdInput && medIdInput.value && lotSelect && lotSelect.value && expDateInput && expDateInput.value && qtyInput && qtyInput.value) {
                 dispenseData.items.push({
                    medicine_id: parseInt(medIdInput.value),
                    lot_number: lotSelect.value,
                    expiry_date: expDateInput.value, 
                    quantity_dispensed: parseInt(qtyInput.value)
                });
            } else {
                if(medIdInput.value || (lotSelect && lotSelect.value) || expDateInput.value || qtyInput.value){ 
                    allItemsValid = false;
                }
            }
        });
        
        if (!allItemsValid || dispenseData.items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณากรอกข้อมูลรายการยาให้ครบถ้วน หรือเพิ่มรายการยาอย่างน้อย 1 รายการ', 'error');
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
            if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory(); 
            if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

/**
 * Adds a dynamic item row specifically for the dispense form.
 */
function addDynamicItemRowForDispense(containerId, hcodeContext) {
    const itemsContainer = document.getElementById(containerId);
    if (!itemsContainer) return;
    const itemCount = itemsContainer.children.length;

    const newItemRow = document.createElement('div');
    newItemRow.className = 'flex items-center space-x-2 mb-2 animate-fadeIn relative';
    newItemRow.innerHTML = `
        <input type="text" 
               placeholder="ค้นหารหัสยา/ชื่อยา" 
               class="input-field flex-grow !mb-0 medicine-search-input" 
               name="items[${itemCount}][medicine_display_name]" 
               oninput="handleMedicineSearch(event, ${itemCount}, '${hcodeContext}', 'fetchAndPopulateLotsForDispense')" 
               onkeydown="navigateSuggestions(event, ${itemCount})"
               data-hcode-context="${hcodeContext}"
               data-medicine-select-callback="fetchAndPopulateLotsForDispense"
               data-row-index="${itemCount}"
               autocomplete="off"
               required>
        <input type="hidden" name="items[${itemCount}][medicine_id]">
        <div class="suggestions-box absolute top-full left-0 z-10 w-full bg-white border border-gray-300 rounded-md mt-1 shadow-lg hidden max-h-40 overflow-y-auto"></div>
        
        <select name="items[${itemCount}][lot_number]" class="input-field w-48 !mb-0 lot-number-select" required disabled>
            <option value="">-- เลือกยาก่อน --</option>
        </select>
        <input type="text" placeholder="dd/mm/yyyy" class="input-field w-32 !mb-0 dispense-expiry-date thai-date-formatter" name="items[${itemCount}][expiry_date]" readonly required>
        <input type="number" placeholder="จำนวน" class="input-field w-24 !mb-0" name="items[${itemCount}][quantity_dispensed]" min="1" required>
        <span class="text-xs text-gray-500 lot-quantity-display w-20 whitespace-nowrap overflow-hidden text-ellipsis" title=""></span>
        <button type="button" class="btn btn-danger btn-sm text-xs !p-2" onclick="this.parentElement.remove()">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3-fill" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5M4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06m6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528M8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5"/></svg>
        </button>
    `;
    itemsContainer.appendChild(newItemRow);

    const newLotSelect = newItemRow.querySelector('.lot-number-select');
    const newExpDateInput = newItemRow.querySelector('.dispense-expiry-date');
    const newLotQtyDisplay = newItemRow.querySelector('.lot-quantity-display');

    if (newLotSelect && newExpDateInput && newLotQtyDisplay) {
        newLotSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset.exp) {
                newExpDateInput.value = selectedOption.dataset.exp; 
                newLotQtyDisplay.textContent = `(มี ${selectedOption.dataset.qty || 0})`;
                newLotQtyDisplay.title = `มี ${selectedOption.dataset.qty || 0} ในสต็อก`;
            } else {
                newExpDateInput.value = '';
                newLotQtyDisplay.textContent = '';
                newLotQtyDisplay.title = '';
            }
        });
    }
}

async function fetchAndPopulateLotsForDispense(medicineId, itemRowElement, hcodeContext) {
    if (!itemRowElement || !medicineId || !hcodeContext) {
        console.error("Missing parameters for fetchAndPopulateLotsForDispense", medicineId, itemRowElement, hcodeContext);
        const lotSelect = itemRowElement ? itemRowElement.querySelector('.lot-number-select') : null;
        if(lotSelect) {
            lotSelect.innerHTML = '<option value="">-- ข้อผิดพลาด --</option>';
            lotSelect.disabled = true;
        }
        return;
    }

    const lotSelect = itemRowElement.querySelector('.lot-number-select');
    const expiryDateInput = itemRowElement.querySelector('.dispense-expiry-date');
    const lotQuantityDisplay = itemRowElement.querySelector('.lot-quantity-display');

    if (!lotSelect || !expiryDateInput || !lotQuantityDisplay) {
        console.error("Lot select, expiry input, or quantity display not found in item row for dispense.", itemRowElement);
        return;
    }

    lotSelect.innerHTML = '<option value="">กำลังโหลด Lot...</option>';
    lotSelect.disabled = true;
    expiryDateInput.value = '';
    lotQuantityDisplay.textContent = '';

    try {
        const lots = await fetchData(`/inventory/lots?medicine_id=${medicineId}&hcode=${hcodeContext}`);
        lotSelect.innerHTML = ''; 

        if (lots && lots.length > 0) {
            lotSelect.appendChild(new Option('-- เลือก Lot --', ''));
            lots.forEach(lot => {
                const optionText = `Lot: ${lot.lot_number} (หมดอายุ: ${lot.expiry_date}, คงเหลือ: ${lot.quantity_on_hand})`;
                const option = new Option(optionText, lot.lot_number);
                option.dataset.exp = lot.expiry_date; 
                option.dataset.expIso = lot.expiry_date_iso; 
                option.dataset.qty = lot.quantity_on_hand;
                lotSelect.appendChild(option);
            });
            lotSelect.disabled = false;
        } else {
            lotSelect.appendChild(new Option('ไม่พบ Lot ที่มีในคลัง', ''));
            lotSelect.disabled = true;
            expiryDateInput.value = 'N/A';
            lotQuantityDisplay.textContent = '(0)';
        }
    } catch (error) {
        console.error("Error fetching lots for dispense:", error);
        lotSelect.innerHTML = '<option value="">เกิดข้อผิดพลาด</option>';
        lotSelect.disabled = true;
        expiryDateInput.value = 'Error';
        lotQuantityDisplay.textContent = '';
    }
}

function uploadDispenseExcel() {
    // ... (โค้ดเดิม, ตรวจสอบ currentUser.hcode ก่อนอัปโหลด) ...
    const fileInput = document.getElementById('excelUploadDispense');
    if (!fileInput) {
        console.error("Excel upload input for dispense not found.");
        return;
    }
    if (!currentUser || !currentUser.hcode) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถอัปโหลดได้: ไม่พบข้อมูลผู้ใช้หรือรหัสหน่วยบริการ', 'error');
        return;
    }

    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        Swal.fire({
            title: 'ยืนยันการอัปโหลดไฟล์ตัดจ่ายยา',
            text: `คุณต้องการอัปโหลดไฟล์ ${fileName} เพื่อตัดจ่ายยาสำหรับหน่วยบริการ ${currentUser.hcode} ใช่หรือไม่?`,
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#3b82f6', 
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'อัปโหลด',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: 'กำลังอัปโหลด...',
                    text: 'กรุณารอสักครู่ (ยังไม่เชื่อมต่อ Backend)',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });
                setTimeout(() => { 
                    Swal.fire('อัปโหลดสำเร็จ!', `ไฟล์ ${fileName} ได้รับการประมวลผลเพื่อตัดจ่ายยาแล้ว (จำลอง).`, 'success');
                    fileInput.value = ''; 
                    if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory();
                    if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary();
                }, 2000);
            }
        });
    } else {
        Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกไฟล์ Excel ที่ต้องการอัปโหลด', 'error');
    }
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
    modalBody.innerHTML = `
        <div class="space-y-3 mb-4">
            <p><strong>เลขที่เอกสาร:</strong> ${recordHeaderDetails.dispense_record_number || `DSP-${recordId}`}</p>
            <p><strong>วันที่จ่าย:</strong> ${recordHeaderDetails.dispense_date}</p> 
            <p><strong>ผู้จ่ายยา:</strong> ${recordHeaderDetails.dispenser_name}</p>
            <p><strong>ประเภทการจ่าย:</strong> ${recordHeaderDetails.dispense_type || '-'}</p>
            <p><strong>จ่ายจากหน่วยบริการ:</strong> ${recordHeaderDetails.hcode || currentUser.hcode || 'N/A'}</p>
            <p><strong>หมายเหตุเอกสาร:</strong> ${recordHeaderDetails.remarks || '-'}</p>
            ${recordHeaderDetails.status === 'ยกเลิก' ? '<p class="text-red-600 font-semibold">สถานะ: เอกสารนี้ถูกยกเลิกแล้ว</p>' : ''}
        </div>
        <p class="text-sm text-blue-600 my-3">หากต้องการแก้ไขรายการยา กรุณายกเลิกเอกสารนี้และสร้างใหม่</p>
        <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่จ่าย:</h4>
        <div class="overflow-x-auto" id="dispenseDetailItemsContainerModal">
            <p class="text-center text-gray-400 py-3">กำลังโหลดรายการยา...</p>
        </div>
        <div class="flex justify-end mt-6 space-x-3">
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
                    </tr>
                `;
            });
        } else {
            itemsTableHtml += '<tr><td colspan="5" class="text-center text-gray-500 py-3">ไม่พบรายการยาในเอกสารนี้</td></tr>';
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
                        <option value="ผู้ป่วยใน" ${recordData.dispense_type === 'ผู้ป่วยใน' ? 'selected' : ''}>ผู้ป่วยใน</option>
                        <option value="หน่วยงานภายใน" ${recordData.dispense_type === 'หน่วยงานภายใน' ? 'selected' : ''}>หน่วยงานภายใน</option>
                        <option value="อื่นๆ" ${recordData.dispense_type === 'อื่นๆ' ? 'selected' : ''}>อื่นๆ</option>
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
                closeModal('formModal'); // Close details modal if open
                if (typeof loadAndDisplayDispenseHistory === 'function') loadAndDisplayDispenseHistory();
                if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary(); 
            } catch (error) { /* Handled by fetchData */ }
        }
    });
}
