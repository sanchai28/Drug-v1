// requisitions.js

/**
 * Loads and displays requisitions based on date range and user's hcode/role.
 * Assumes API_BASE_URL, fetchData, iso_to_thai_date, openRequisitionDetailsModal, 
 * cancelRequisition, currentUser are globally available.
 */
async function loadAndDisplayRequisitions() {
    const tableBody = document.getElementById("requisitionManagementTableBody");
    if (!tableBody) {
        console.error("Table body for requisitions not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลใบเบิก...</td></tr>';
    
    if (!currentUser) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่</td></tr>';
        console.warn("Cannot load requisitions: currentUser is not defined.");
        return;
    }

    const startDate = document.getElementById('startDateReq').value;
    const endDate = document.getElementById('endDateReq').value;
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    if (currentUser.hcode) {
        params.append('hcode', currentUser.hcode);
    }
    if (currentUser.role) {
        params.append('role', currentUser.role);
    }

    try {
        const endpoint = `/requisitions?${params.toString()}`;
        const requisitions = await fetchData(endpoint); // fetchData is in utils.js
        tableBody.innerHTML = '';

        if (!requisitions || requisitions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบข้อมูลใบเบิกในช่วงวันที่ที่เลือก หรือสำหรับหน่วยงานของคุณ</td></tr>';
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
                <td>${req.requester_name} (${req.requester_hospital_name || req.requester_hcode || ''})</td>
                <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${req.status}</span></td>
                <td>
                    <button onclick="openRequisitionDetailsModal('${req.requisition_number}', '${req.requester_name}', '${req.requisition_date}', '${req.status}', ${req.id})" class="btn btn-secondary btn-sm text-xs px-2 py-1">ดูรายละเอียด</button>
                    ${req.status === 'รออนุมัติ' && currentUser.role === 'เจ้าหน้าที่ รพสต.' && currentUser.hcode === req.requester_hcode ? `<button onclick="cancelRequisition(${req.id}, '${req.requisition_number}')" class="btn btn-danger btn-sm text-xs px-2 py-1 ml-1">ยกเลิก</button>` : ''}
                </td>
            `;
        });
    } catch (error) {
         tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิก</td></tr>';
    }
}

/**
 * Loads and displays requisitions pending approval.
 * This is typically for 'เจ้าหน้าที่ รพ. แม่ข่าย' or 'ผู้ดูแลระบบ'.
 */
async function loadAndDisplayPendingApprovals() {
    const tableBody = document.getElementById("requisitionApprovalTableBody");
    if (!tableBody) {
        console.error("Table body for pending approvals not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลใบเบิกรออนุมัติ...</td></tr>';
    
    if (!currentUser) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่</td></tr>';
        return;
    }
    
    const startDate = document.getElementById('startDateApprv').value;
    const endDate = document.getElementById('endDateApprv').value;
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    try {
        const endpoint = `/requisitions/pending_approval?${params.toString()}`;
        const requisitions = await fetchData(endpoint);
        tableBody.innerHTML = '';

        if (!requisitions || requisitions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบใบเบิกที่รออนุมัติในช่วงวันที่ที่เลือก</td></tr>';
            return;
        }

        requisitions.forEach(req => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${req.requisition_number}</td>
                <td>${req.requester_hospital_name || req.requester_name} (${req.requester_hcode || ''})</td> 
                <td>${req.requisition_date}</td>
                <td class="text-center">${req.item_count}</td>
                <td>
                    <button onclick="openApproveRequisitionModal(${req.id}, '${req.requisition_number}')" class="btn btn-primary btn-sm text-xs px-2 py-1">ตรวจสอบและอนุมัติ</button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิกรออนุมัติ</td></tr>';
    }
}


/**
 * Opens a modal to create a new requisition.
 */
function openCreateRequisitionModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลผู้ใช้งานปัจจุบัน กรุณาเข้าสู่ระบบใหม่', 'error');
        return;
    }
    if (!currentUser.hcode && currentUser.role === 'เจ้าหน้าที่ รพสต.') {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถสร้างใบเบิกได้: ไม่พบรหัสหน่วยบริการของผู้ใช้ปัจจุบัน', 'error');
        return;
    }
    const hcodeForRequisition = currentUser.hcode || ''; 

    modalTitle.textContent = 'สร้างใบเบิกยาใหม่';
    modalBody.innerHTML = `
        <form id="createRequisitionForm">
            <p class="text-sm text-gray-600 mb-4">ระบบจะแสดงรายการยาที่ต่ำกว่าจุดสั่งซื้อให้อัตโนมัติ (ถ้ามี)</p>
            <div class="mb-4">
                <label for="reqDate" class="label">วันที่เบิก:</label>
                <input type="text" id="reqDate" name="requisition_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
            </div>
            <div class="mb-4">
                <label for="requesterNameDisplay" class="label">ผู้เบิก (หน่วยบริการ):</label>
                <input type="text" id="requesterNameDisplay" name="requester_name_display" class="input-field bg-gray-100" value="${currentUser.full_name} (${hcodeForRequisition || 'N/A'})" readonly> 
                <input type="hidden" id="requesterId" name="requester_id" value="${currentUser.id}">
                <input type="hidden" id="requesterHcode" name="requester_hcode" value="${hcodeForRequisition}"> 
            </div>
            <div class="mb-4">
                <label class="label">รายการยาที่ต้องการเบิก:</label>
                <div id="requisitionItemsContainer">
                    </div>
                <button type="button" class="btn btn-success btn-sm text-xs mt-2" 
                        onclick="addDynamicItemRow('requisitionItemsContainer', ['medicine-search', 'number'], ['ค้นหารหัสยา/ชื่อยา', 'จำนวน'], ['medicine_id', 'quantity_requested'], 'items', '${hcodeForRequisition}', null)">
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
    addDynamicItemRow('requisitionItemsContainer', 
        ['medicine-search', 'number'], 
        ['ค้นหารหัสยา/ชื่อยา', 'จำนวน'], 
        ['medicine_id', 'quantity_requested'], 
        'items', 
        hcodeForRequisition, 
        null 
    );


     document.getElementById('createRequisitionForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const requisitionData = {
            requisition_date: formData.get('requisition_date'), 
            requester_id: parseInt(formData.get('requester_id')),
            requester_hcode: formData.get('requester_hcode'), 
            items: []
        };
        
        if (!requisitionData.requester_hcode && currentUser.role === 'เจ้าหน้าที่ รพสต.') {
            Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสหน่วยบริการของผู้ขอเบิก', 'error');
            return;
        }

        const itemRows = document.querySelectorAll('#requisitionItemsContainer > div');
        let allItemsValid = true;
        itemRows.forEach((row, index) => {
            const medIdInput = row.querySelector(`input[name="items[${index}][medicine_id]"]`);
            const qtyInput = row.querySelector(`input[name="items[${index}][quantity_requested]"]`);
            if (medIdInput && medIdInput.value && qtyInput && qtyInput.value) { 
                 requisitionData.items.push({
                    medicine_id: parseInt(medIdInput.value),
                    quantity_requested: parseInt(qtyInput.value)
                });
            } else {
                if(medIdInput.value || qtyInput.value) { 
                    allItemsValid = false;
                }
            }
        });

        if (!allItemsValid || requisitionData.items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณากรอกข้อมูลรายการยาให้ครบถ้วน หรือเพิ่มรายการยาอย่างน้อย 1 รายการ', 'error');
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
            if (typeof loadAndDisplayRequisitions === 'function') loadAndDisplayRequisitions(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

/**
 * Opens a modal to display requisition details and its items.
 */
async function openRequisitionDetailsModal(requisitionNumber, requester, date, status, requisitionId) { 
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser) return;

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
            ${status === 'รออนุมัติ' && currentUser.role === 'เจ้าหน้าที่ รพสต.' ? `<button type="button" class="btn btn-danger" onclick="cancelRequisition(${requisitionId}, '${requisitionNumber}')">ยกเลิกใบเบิก</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal');

    const itemsTableBody = document.getElementById('requisitionDetailItemsTableBody');
    if(!itemsTableBody) return;
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

/**
 * Opens a modal for approving/rejecting a requisition by Main Hospital staff.
 */
async function openApproveRequisitionModal(requisitionId, requisitionNumber) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ข้อมูลผู้ใช้หรือ Modal ไม่พร้อมใช้งาน', 'error');
        return;
    }

    modalTitle.textContent = `อนุมัติใบเบิกยาเลขที่: ${requisitionNumber}`;
    modalBody.innerHTML = `<p class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลใบเบิก ID: ${requisitionId}...</p>`;
    openModal('formModal');

    try {
        const reqHeaderData = await fetchData(`/requisitions/${requisitionId}`); 
        if (!reqHeaderData || typeof reqHeaderData !== 'object') {
            throw new Error('ไม่สามารถโหลดข้อมูลหัวใบเบิกได้ หรือข้อมูลไม่ถูกต้อง');
        }

        const items = await fetchData(`/requisitions/${requisitionId}/items`);
        const validItems = Array.isArray(items) ? items : [];

        let itemsHtml = '';
        if (validItems.length > 0) {
            validItems.forEach((item, index) => {
                const quantityToApprove = item.quantity_requested; 
                const approvedLot = item.approved_lot_number || '';
                const approvedExp = item.approved_expiry_date || getCurrentThaiDateString();

                itemsHtml += `
                    <tr data-requisition-item-id="${item.requisition_item_id}">
                        <td>${item.generic_name || 'N/A'} (${item.strength || 'N/A'})</td>
                        <td class="text-center">${item.quantity_requested}</td>
                        <td><input type="number" name="items[${index}][quantity_approved]" class="input-field !p-1.5 text-sm w-20 !mb-0" value="${quantityToApprove}" min="0" max=""></td>
                        <td><input type="text" name="items[${index}][approved_lot_number]" class="input-field !p-1.5 text-sm w-28 !mb-0" placeholder="P12345" value="${approvedLot}"></td>
                        <td><input type="text" name="items[${index}][approved_expiry_date]" class="input-field !p-1.5 text-sm w-36 !mb-0 thai-date-formatter" placeholder="dd/mm/yyyy" value="${approvedExp}"></td>
                        <td><input type="text" name="items[${index}][reason_for_change_or_rejection]" class="input-field !p-1.5 text-sm !mb-0" placeholder="เหตุผล (ถ้ามี)" value="${item.reason_for_change_or_rejection || ''}"></td>
                        <td>
                            <select name="items[${index}][item_approval_status]" class="input-field !p-1.5 text-sm !mb-0">
                                <option value="อนุมัติ" ${item.item_approval_status === 'อนุมัติ' || !item.item_approval_status ? 'selected' : ''}>อนุมัติ</option>
                                <option value="แก้ไขจำนวน" ${item.item_approval_status === 'แก้ไขจำนวน' ? 'selected' : ''}>แก้ไขจำนวน</option>
                                <option value="ปฏิเสธ" ${item.item_approval_status === 'ปฏิเสธ' ? 'selected' : ''}>ปฏิเสธ</option>
                            </select>
                        </td>
                    </tr>
                `;
            });
        } else {
            itemsHtml = '<tr><td colspan="7" class="text-center py-3">ไม่พบรายการยาในใบเบิกนี้</td></tr>';
        }

        modalBody.innerHTML = `
            <form id="approveRequisitionForm">
                <div class="space-y-2 mb-4">
                    <p><strong>รพสต. ผู้ขอเบิก:</strong> <span id="approveReqHospital">${reqHeaderData.requester_hospital_name || reqHeaderData.requester_name || 'N/A'} (${reqHeaderData.requester_hcode || 'N/A'})</span></p>
                    <p><strong>วันที่ขอเบิก:</strong> <span id="approveReqDate">${reqHeaderData.requisition_date_thai || iso_to_thai_date(reqHeaderData.requisition_date) || 'N/A'}</span></p>
                </div>
                <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่ขอเบิก:</h4>
                <div class="overflow-x-auto mb-4">
                    <table class="custom-table text-sm">
                        <thead><tr><th>ชื่อยา</th><th>จำนวนขอเบิก</th><th>จำนวนอนุมัติ</th><th>Lot No. (จ่ายจาก)</th><th>Exp. Date</th><th>เหตุผล</th><th>ดำเนินการ</th></tr></thead>
                        <tbody id="approveRequisitionItemsTableBody">
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>
                 <div class="flex justify-end space-x-3 mt-6">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">ยืนยันการอนุมัติ/ดำเนินการ</button>
                </div>
            </form>
        `;
        
        document.getElementById('approveRequisitionForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const approvalData = {
                // requisition_id is in the URL for the endpoint
                approved_by_id: currentUser.id, 
                approver_hcode: currentUser.hcode, // hcode of the user performing the approval
                items: []
            };

            const itemRows = document.querySelectorAll('#approveRequisitionItemsTableBody tr');
            itemRows.forEach((row) => { 
                const reqItemId = row.dataset.requisitionItemId;
                if (!reqItemId) return; 

                const qtyApprovedInput = row.querySelector(`input[name*="[quantity_approved]"]`);
                const lotInput = row.querySelector(`input[name*="[approved_lot_number]"]`);
                const expDateInput = row.querySelector(`input[name*="[approved_expiry_date]"]`);
                const reasonInput = row.querySelector(`input[name*="[reason_for_change_or_rejection]"]`);
                const statusSelect = row.querySelector(`select[name*="[item_approval_status]"]`);
                
                if (qtyApprovedInput && statusSelect) { 
                    approvalData.items.push({
                        requisition_item_id: parseInt(reqItemId),
                        quantity_approved: parseInt(qtyApprovedInput.value),
                        approved_lot_number: lotInput ? lotInput.value : null,
                        approved_expiry_date: expDateInput ? expDateInput.value : null, 
                        item_approval_status: statusSelect.value,
                        reason_for_change_or_rejection: reasonInput ? reasonInput.value : ''
                    });
                }
            });
            
            console.log("Approval Data to send:", JSON.stringify(approvalData, null, 2));
            
            try {
                const responseData = await fetchData(`/requisitions/${requisitionId}/process_approval`, { 
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(approvalData)
                });
                Swal.fire('สำเร็จ', responseData.message || `ดำเนินการใบเบิก ${requisitionNumber} เรียบร้อยแล้ว`, 'success');
                closeModal('formModal');
                if (typeof loadAndDisplayPendingApprovals === 'function') loadAndDisplayPendingApprovals(); 
                if (typeof loadAndDisplayRequisitions === 'function') loadAndDisplayRequisitions(); 
            } catch (error) {
                // Error handled by fetchData
            }
        });

    } catch (error) {
        console.error("Error in openApproveRequisitionModal:", error); 
        modalBody.innerHTML = `<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิก: ${error.message}</p>
                               <div class="flex justify-end mt-6"><button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button></div>`;
    }
}


/**
 * Confirms and handles the cancellation of a requisition.
 * @param {number} requisitionId - The ID of the requisition to cancel.
 * @param {string} requisitionNumber - The number of the requisition for confirmation.
 */
async function cancelRequisition(requisitionId, requisitionNumber) {
    if (!currentUser || !currentUser.id) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ไม่พบข้อมูลผู้ใช้งาน', 'error');
        return;
    }
    
    Swal.fire({
        title: 'ยืนยันการยกเลิกใบเบิก',
        text: `คุณต้องการยกเลิกใบเบิกเลขที่ ${requisitionNumber} (ID: ${requisitionId}) ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'ใช่, ยกเลิกเลย!',
        cancelButtonText: 'ไม่'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const payload = {
                    user_id: currentUser.id, 
                    // user_hcode: currentUser.hcode // Backend can derive hcode from user_id if needed for logging/permission
                };
                const responseData = await fetchData(`/requisitions/${requisitionId}/cancel`, { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                Swal.fire('สำเร็จ!', responseData.message || `ใบเบิก ${requisitionNumber} ถูกยกเลิกแล้ว.`, 'success');
                
                const modalTitle = document.getElementById('modalTitle');
                if (modalTitle && modalTitle.textContent.includes(requisitionNumber)) { // Check if the details modal for this req is open
                    closeModal('formModal');
                }

                if (typeof loadAndDisplayRequisitions === 'function') loadAndDisplayRequisitions(); 
                if (typeof loadAndDisplayPendingApprovals === 'function') loadAndDisplayPendingApprovals(); 
            } catch (error) {
                console.error("Error cancelling requisition:", error);
            }
        }
    });
}
