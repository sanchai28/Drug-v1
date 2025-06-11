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
                <div class="flex items-center mb-2"> <!-- Flex container for buttons -->
                    <button type="button" id="autoGenerateRequisitionItems" class="btn btn-success mr-2"> <!-- Success color, consistent with add item -->
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-magic mr-2" viewBox="0 0 16 16"><path d="M9.5 2.672a.5.5 0 1 0 1 0V.843a.5.5 0 0 0-1 0zm4.5.035A.5.5 0 0 0 13.5 2h-1.5a.5.5 0 0 0 0 1h1.5a.5.5 0 0 0 .5-.5q0-.146-.066-.277M11.293 4.707a.5.5 0 0 0 .707-.707L11.207.707a.5.5 0 0 0-.707.707zm-9.796 8.42a.5.5 0 0 0 .707.707l1.293-1.293a.5.5 0 0 0-.707-.707zM1.5 10.5a.5.5 0 0 0 0-1H.5a.5.5 0 0 0 0 1zm2.467-3.41a.5.5 0 0 0-.707.707l.001.001a.5.5 0 0 0 .707-.707zm3.129-1.85a.5.5 0 1 0 0-1H6.25a.5.5 0 0 0 0 1h.846zM4.934 1.5a.5.5 0 0 0 0 1h.033a.5.5 0 0 0 0-1zm1.293 1.293A.5.5 0 0 0 6.934 2h.033a.5.5 0 0 0 0-1h-.033a.5.5 0 0 0-.707.293zM7.58 15.424a.5.5 0 0 0 .707-.707l-1.293-1.293a.5.5 0 0 0-.707.707l1.293 1.293zM10.5 13.5a.5.5 0 0 0 1 0v-1.5a.5.5 0 0 0-1 0zM2.328 13.277a.5.5 0 0 0-.707-.707L.707 13.277a.5.5 0 0 0 .707.707l.914-.913zm11.83-3.182a.5.5 0 0 0-.707.707l.914.914a.5.5 0 0 0 .707-.707zM2 1.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0 0 1h1a.5.5 0 0 0 .5-.5M12.5 0a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5z"/></svg>
                        สร้างรายการอัตโนมัติ (ต่ำกว่า Min)
                    </button>
                    <button type="button" class="btn btn-info" 
                            onclick="addDynamicItemRow('requisitionItemsContainer', ['medicine-search', 'number'], ['ค้นหารหัสยา/ชื่อยา', 'จำนวน'], ['medicine_id', 'quantity_requested'], 'items', '${hcodeForRequisition}', 'onMedicineSelectedForRequisition')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-lg mr-1" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/></svg>
                        เพิ่มรายการยา (ด้วยตนเอง)
                    </button>
                </div>
                <div id="requisitionItemsContainer">
                    <!-- Dynamic item rows will be added here -->
                </div>
            </div>
            <div id="itemsInfoContainer" class="mt-2">
                <!-- Stock info for items will be dynamically added here by the callback -->
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
        'onMedicineSelectedForRequisition' // Changed to string
    );

    // Event listener for the new auto-generate button
    const autoGenerateBtn = document.getElementById('autoGenerateRequisitionItems');
    if (autoGenerateBtn) {
        autoGenerateBtn.addEventListener('click', handleAutoGenerateItems);
    }

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
                <thead>
                    <tr>
                        <th>รหัสยา</th>
                        <th>ชื่อยา</th>
                        <th>ความแรง</th>
                        <th>หน่วยนับ</th>
                        <th class="text-center">คงคลัง</th>
                        <th class="text-center">Min</th>
                        <th class="text-center">Max</th>
                        <th class="text-center">ขอเบิก</th>
                        <th class="text-center">อนุมัติ</th>
                    </tr>
                </thead>
                <tbody id="requisitionDetailItemsTableBody">
                    <tr><td colspan="9" class="text-center py-3">กำลังโหลดรายการยา...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="flex justify-end mt-6 space-x-3">
            ${status === 'รออนุมัติ' && currentUser.role === 'เจ้าหน้าที่ รพสต.' && currentUser.hcode === reqHeaderData.requester_hcode ? `<button type="button" class="btn btn-danger" onclick="cancelRequisition(${requisitionId}, '${requisitionNumber}')">ยกเลิกใบเบิก</button>` : ''}
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
                    <td class="text-center">${item.total_quantity_on_hand !== null ? item.total_quantity_on_hand : '-'}</td>
                    <td class="text-center">${item.min_stock !== null ? item.min_stock : '-'}</td>
                    <td class="text-center">${item.max_stock !== null ? item.max_stock : '-'}</td>
                    <td class="text-center">${item.quantity_requested}</td>
                    <td class="text-center">${item.quantity_approved !== null ? item.quantity_approved : '-'}</td>
                `;
            });
        } else {
            itemsTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-4">ไม่พบรายการยาในใบเบิกนี้</td></tr>'; // Updated colspan
        }
    } catch (error) {
        itemsTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดรายการยา</td></tr>'; // Updated colspan
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
                const approvedLot = item.approved_lot_number || ''; // Default to empty string if not set
                // Default approvedExp to empty string if not set
                const approvedExp = item.approved_expiry_date ? iso_to_thai_date(item.approved_expiry_date) : '';

                itemsHtml += `
                    <tr data-requisition-item-id="${item.requisition_item_id}">
                        <td>${item.generic_name || 'N/A'} (${item.strength || 'N/A'})</td>
                        <td class="text-center">${item.total_quantity_on_hand !== null ? item.total_quantity_on_hand : '-'}</td>
                        <td class="text-center">${item.min_stock !== null ? item.min_stock : '-'}</td>
                        <td class="text-center">${item.max_stock !== null ? item.max_stock : '-'}</td>
                        <td class="text-center">${item.quantity_requested}</td>
                        <td><input type="number" name="items[${index}][quantity_approved]" class="input-field !p-1.5 text-sm w-20 !mb-0" value="${quantityToApprove}" min="0" max="${item.quantity_requested}"></td>
                        <td><input type="text" name="items[${index}][approved_lot_number]" class="input-field !p-1.5 text-sm w-28 !mb-0" placeholder="P12345" value="${approvedLot}"></td>
                        <td><input type="text" name="items[${index}][approved_expiry_date]" class="input-field !p-1.5 text-sm w-36 !mb-0 thai-date-formatter" placeholder="dd/mm/yyyy" value="${approvedExp}"></td>
                        <td><input type="text" name="items[${index}][reason_for_change_or_rejection]" class="input-field !p-1.5 text-sm !mb-0" placeholder="เหตุผล (ถ้ามี)" value="${item.reason_for_change_or_rejection || ''}"></td>
                        <td>
                            <select name="items[${index}][item_approval_status]" class="input-field !p-1.5 text-sm !mb-0">
                                <option value="อนุมัติ" ${item.item_approval_status === 'อนุมัติ' || !item.item_approval_status || item.item_approval_status === 'รออนุมัติ' ? 'selected' : ''}>อนุมัติ</option>
                                <option value="แก้ไขจำนวน" ${item.item_approval_status === 'แก้ไขจำนวน' ? 'selected' : ''}>แก้ไขจำนวน</option>
                                <option value="ปฏิเสธ" ${item.item_approval_status === 'ปฏิเสธ' ? 'selected' : ''}>ปฏิเสธ</option>
                            </select>
                        </td>
                    </tr>
                `;
            });
        } else {
            itemsHtml = '<tr><td colspan="10" class="text-center py-3">ไม่พบรายการยาในใบเบิกนี้</td></tr>'; // Updated colspan
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
                        <thead>
                            <tr>
                                <th>ชื่อยา</th>
                                <th class="text-center">คงคลัง</th>
                                <th class="text-center">Min</th>
                                <th class="text-center">Max</th>
                                <th class="text-center">ขอเบิก</th>
                                <th>จำนวนอนุมัติ</th>
                                <th>Lot No. (จ่ายจาก)</th>
                                <th>Exp. Date</th>
                                <th>เหตุผล</th>
                                <th>ดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody id="approveRequisitionItemsTableBody">
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>
                 <div class="flex justify-end space-x-3 mt-6">
                    <button type="button" class="btn btn-info mr-auto" onclick="handlePrintRequisition(${requisitionId}, '${requisitionNumber}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-printer-fill mr-2" viewBox="0 0 16 16"><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2z"/><path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4z"/></svg>
                        พิมพ์ใบเบิก
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">ยืนยันการอนุมัติ/ดำเนินการ</button>
                </div>
            </form>
        `;
        
        document.querySelectorAll('#approveRequisitionItemsTableBody .thai-date-formatter').forEach(el => {
            if (typeof autoFormatThaiDateInput === 'function') {
                el.addEventListener('input', autoFormatThaiDateInput);
            }
        });

        document.getElementById('approveRequisitionForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const approvalData = {
                approved_by_id: currentUser.id, 
                approver_hcode: currentUser.hcode, 
                items: []
            };

            const itemRows = document.querySelectorAll('#approveRequisitionItemsTableBody tr');
            let formIsValid = true;
            itemRows.forEach((row) => { 
                const reqItemId = row.dataset.requisitionItemId;
                if (!reqItemId) return; 

                const qtyApprovedInput = row.querySelector(`input[name*="[quantity_approved]"]`);
                const lotInput = row.querySelector(`input[name*="[approved_lot_number]"]`);
                const expDateInput = row.querySelector(`input[name*="[approved_expiry_date]"]`);
                const reasonInput = row.querySelector(`input[name*="[reason_for_change_or_rejection]"]`);
                const statusSelect = row.querySelector(`select[name*="[item_approval_status]"]`);
                
                if (qtyApprovedInput && statusSelect) { 
                    const qtyApproved = parseInt(qtyApprovedInput.value);
                    const itemStatus = statusSelect.value;
                    let approvedExpDateISO = null;

                    if (itemStatus === 'อนุมัติ' || itemStatus === 'แก้ไขจำนวน') {
                        approvedExpDateISO = thai_to_iso_date_frontend(expDateInput.value); //
                        if (isNaN(qtyApproved) || qtyApproved < 0) {
                             Swal.fire('ข้อมูลไม่ถูกต้อง', `จำนวนอนุมัติต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0 สำหรับ: ${row.cells[0].textContent}`, 'warning');
                             qtyApprovedInput.focus();
                             formIsValid = false;
                             return;
                        }
                    }


                    approvalData.items.push({
                        requisition_item_id: parseInt(reqItemId),
                        quantity_approved: qtyApproved,
                        approved_lot_number: lotInput ? lotInput.value : null,
                        approved_expiry_date: approvedExpDateISO, 
                        item_approval_status: itemStatus,
                        reason_for_change_or_rejection: reasonInput ? reasonInput.value : ''
                    });
                }
            });
            
            if (!formIsValid) {
                return; 
            }
            
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
                };
                const responseData = await fetchData(`/requisitions/${requisitionId}/cancel`, { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                Swal.fire('สำเร็จ!', responseData.message || `ใบเบิก ${requisitionNumber} ถูกยกเลิกแล้ว.`, 'success');
                
                const modalTitle = document.getElementById('modalTitle');
                if (modalTitle && modalTitle.textContent.includes(requisitionNumber)) { 
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

/**
 * Handles the print requisition action by fetching data and generating HTML for printing.
 * @param {number} requisitionId - The ID of the requisition to print.
 * @param {string} requisitionNumber - The number of the requisition.
 */

// Callback function for when a medicine is selected in a dynamic item row for requisitions
function onMedicineSelectedForRequisition(selectedItem, rowElement, itemIndex) {
    if (!rowElement) {
        console.warn("onMedicineSelectedForRequisition: rowElement is undefined for index", itemIndex);
        return;
    }
    let stockInfoDiv = rowElement.querySelector(`#stockInfo_row_${itemIndex}`);
    if (!stockInfoDiv) {
        stockInfoDiv = document.createElement('div');
        stockInfoDiv.id = `stockInfo_row_${itemIndex}`;
        stockInfoDiv.className = 'text-xs text-gray-600 ml-2 mt-1 col-span-full md:col-span-1'; // Adjust grid span as needed
        
        // Find a suitable place to insert it. After the quantity input's parent div, for example.
        const quantityInputParent = rowElement.querySelector('input[name*="[quantity_requested]"]').parentNode;
        if (quantityInputParent && quantityInputParent.parentNode === rowElement) { // Ensure it's a direct child div
             quantityInputParent.insertAdjacentElement('afterend', stockInfoDiv);
        } else { // Fallback: append to the row itself or a specific container within the row
            const firstCell = rowElement.querySelector('div'); // First div cell
            if (firstCell) firstCell.appendChild(stockInfoDiv); // Append to the first cell/column div
        }
    }

    if (selectedItem) {
        const currentStock = selectedItem.total_quantity_on_hand !== null ? selectedItem.total_quantity_on_hand : 'N/A';
        const minStock = selectedItem.min_stock !== null ? selectedItem.min_stock : 'N/A';
        const maxStock = selectedItem.max_stock !== null ? selectedItem.max_stock : 'N/A';
        stockInfoDiv.innerHTML = `<i>Stock: ${currentStock} (Min: ${minStock}, Max: ${maxStock})</i>`;
    } else {
        stockInfoDiv.innerHTML = ''; // Clear if no item selected or data missing
    }
}


async function handleAutoGenerateItems() {
    if (!currentUser || !currentUser.hcode) {
        Swal.fire('Error', 'User hcode not found. Please log in again.', 'error');
        return;
    }

    Swal.fire({
        title: 'Generating items...',
        text: 'Please wait while suggested items are being fetched.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const suggestedItems = await fetchData(`/requisitions/suggest-auto-items?hcode=${currentUser.hcode}`);
        
        const itemsContainer = document.getElementById('requisitionItemsContainer');
        const itemsInfoContainer = document.getElementById('itemsInfoContainer'); // For displaying stock info

        if (!itemsContainer || !itemsInfoContainer) {
            Swal.fire('Error', 'UI components for items not found.', 'error');
            return;
        }
        
        // Clear existing items (user might want a confirmation here in a real app)
        itemsContainer.innerHTML = '';
        itemsInfoContainer.innerHTML = ''; // Clear previous stock info displays
        if (typeof window.resetDynamicItemIndex === 'function') { // Assuming resetDynamicItemIndex is global from utils.js
            window.resetDynamicItemIndex('items'); 
        }


        if (suggestedItems && suggestedItems.length > 0) {
            suggestedItems.forEach(item => {
                // This is where addDynamicItemRow would be ideally refactored.
                // For now, we'll simulate its outcome or call a placeholder.
                // The actual 'addDynamicItemRow' from utils.js needs to be made capable
                // of accepting 'item' and populating the row.
                if (typeof addDynamicItemRow === "function") {
                     addDynamicItemRow(
                        'requisitionItemsContainer',
                        ['medicine-search', 'number'],
                        ['ค้นหารหัสยา/ชื่อยา', 'จำนวน'],
                        ['medicine_id', 'quantity_requested'],
                        'items',
                        currentUser.hcode,
                        'onMedicineSelectedForRequisition', // Changed to string: The callback to display stock info
                        item // Pass the prefilled item
                    );
                } else {
                    console.error("addDynamicItemRow function is not available or not correctly refactored.");
                }
            });
            Swal.fire('Success', `${suggestedItems.length} items suggested and added. Please review quantities.`, 'success');
        } else {
            Swal.fire('Info', 'No items currently require reordering based on Min/Max levels.', 'info');
        }
    } catch (error) {
        console.error('Error auto-generating requisition items:', error);
        Swal.fire('Error', `Failed to suggest items: ${error.message || 'Unknown error'}`, 'error');
    }
}


async function handlePrintRequisition(requisitionId, requisitionNumber) {
    console.log(`Attempting to print requisition ID: ${requisitionId}, Number: ${requisitionNumber}`);
    
    let requisitionHeader;
    try {
        requisitionHeader = await fetchData(`/requisitions/${requisitionId}`);
        if (!requisitionHeader) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลใบเบิกสำหรับพิมพ์ได้', 'error');
            return;
        }
    } catch (error) {
        Swal.fire('ข้อผิดพลาด', `เกิดปัญหาในการดึงข้อมูลใบเบิก: ${error.message}`, 'error');
        return;
    }

    let requisitionItems;
    try {
        requisitionItems = await fetchData(`/requisitions/${requisitionId}/items`);
        if (!requisitionItems) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงรายการยาในใบเบิกสำหรับพิมพ์ได้', 'error');
            return;
        }
    } catch (error) {
        Swal.fire('ข้อผิดพลาด', `เกิดปัญหาในการดึงรายการยา: ${error.message}`, 'error');
        return;
    }

    // Date and Time for printing
    const now = new Date();
    const printDateTimeThai = `${formatDateToThaiString(now)} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;


    let printHtml = `
        <html>
        <head>
            <title>ใบเบิกยาเลขที่ ${requisitionNumber}</title>
            <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                @page {
                    size: A4;
                    margin: 1.5cm 1.5cm 1cm 2cm; /* บน ขวา ล่าง ซ้าย */
                }
                body { 
                    font-family: 'Sarabun', sans-serif; 
                    margin: 0; 
                    font-size: 11pt; /* Adjusted for A4 readability */
                    line-height: 1.4;
                }
                .print-container { 
                    width: 100%; 
                }
                .document-header {
                    text-align: center;
                    margin-bottom: 10px;
                }
                .document-header h2 {
                    font-size: 16pt;
                    font-weight: bold;
                    margin: 0 0 2px 0;
                }
                .document-header h3 {
                    font-size: 14pt;
                    font-weight: normal;
                    margin: 0 0 8px 0;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr; /* Two columns */
                    gap: 0px 15px; /* No vertical gap, 15px horizontal */
                    margin-bottom: 12px;
                    font-size: 11pt;
                }
                .info-grid div {
                    padding: 1px 0; /* Minimal vertical padding */
                }
                
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-top: 10px; 
                    font-size: 10pt; /* Smaller font for table content */
                }
                th, td { 
                    border: 1px solid black; 
                    padding: 4px 6px; 
                    text-align: left; 
                    vertical-align: top;
                }
                th { 
                    background-color: #e9e9e9; 
                    font-weight: bold;
                    text-align: center;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .col-seq { width: 4%; }
                .col-code { width: 10%; }
                .col-name { width: 26%; }
                .col-strength { width: 10%; }
                .col-unit { width: 7%; }
                .col-qty-req { width: 7%; }
                .col-qty-appr { width: 7%; }
                .col-lot { width: 10%; }
                .col-exp { width: 9%; }
                .col-remark { width: 10%; }

                .signature-section { 
                    margin-top: 25px; /* Reduced margin */
                    display: flex; 
                    justify-content: space-between; /* Pushes boxes to edges */
                    padding: 0 1cm; /* Add some padding to prevent boxes from touching edges */
                    font-size: 11pt;
                }
                .signature-box { 
                    width: 40%; /* Adjust width as needed */
                    text-align: center; 
                    margin-top: 20px; 
                }
                .signature-line { 
                    display: inline-block;
                    width: 70%; /* Make line shorter than box */
                    border-bottom: 1px dotted black; 
                    margin-bottom: 5px; 
                    height: 20px; 
                }
                .signature-name {
                     margin-top: 2px;
                }
                .signature-role {
                     font-size: 10pt;
                }

                .footer { 
                    position: fixed; /* Fixed position for footer */
                    bottom: 0.5cm;   /* Position from bottom */
                    left: 2cm;     /* Match left margin */
                    right: 1.5cm;    /* Match right margin */
                    text-align: right; 
                    font-size: 9pt; 
                    border-top: 1px solid #ccc;
                    padding-top: 3px;
                }
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print { display: none; }
                    table { page-break-inside: auto; } /* Allow table to break across pages */
                    tr    { page-break-inside: avoid; page-break-after: auto; } /* Try to keep rows together */
                    thead { display: table-header-group; } /* Repeat table header on each page */
                    tfoot { display: table-footer-group; } /* Repeat table footer on each page */
                     .footer {
                        position: fixed;
                        bottom: 0.5cm;
                        left: 2cm;
                        right: 1.5cm;
                     }
                }
            </style>
        </head>
        <body>
            <div class="print-container">
                <div class="document-header">
                    <h2>ใบเบิกยาและเวชภัณฑ์</h2>
                    <h3> ${requisitionHeader.requester_hospital_name || '(ระบุชื่อ รพสต.)'}</h3>
                </div>

                <div class="info-grid">
                    <div><strong>เลขที่ใบเบิก:</strong> ${requisitionNumber}</div>
                    <div><strong>วันที่เบิก:</strong> ${requisitionHeader.requisition_date_thai || iso_to_thai_date(requisitionHeader.requisition_date)}</div>
                    <div><strong>ผู้ขอเบิก:</strong> ${requisitionHeader.requester_name || 'N/A'}</div>
                    <div><strong>รหัสหน่วยบริการ (ผู้ขอเบิก):</strong> ${requisitionHeader.requester_hcode || 'N/A'}</div>
                    <div><strong>สถานะใบเบิก:</strong> ${requisitionHeader.status}</div>
                    ${requisitionHeader.approved_by_name ? `<div><strong>ผู้อนุมัติ:</strong> ${requisitionHeader.approved_by_name}</div>` : '<div><strong>ผู้อนุมัติ:</strong> -</div>'}
                    ${requisitionHeader.approval_date ? `<div><strong>วันที่อนุมัติ:</strong> ${iso_to_thai_date(requisitionHeader.approval_date)}</div>` : '<div><strong>วันที่อนุมัติ:</strong> -</div>'}
                </div>
                ${requisitionHeader.remarks ? `<div style="margin-bottom: 8px; font-size: 11pt;"><strong>หมายเหตุ (ใบเบิก):</strong> ${requisitionHeader.remarks}</div>` : ''}

                <table>
                    <thead>
                        <tr>
                            <th class="col-seq">ลำดับ</th>
                            <th class="col-code">รหัสยา</th>
                            <th class="col-name">ชื่อยา/เวชภัณฑ์</th>
                            <th class="col-strength">ความแรง</th>
                            <th class="col-unit">หน่วย</th>
                            <th class="col-qty-req">ขอเบิก</th>
                            <th class="col-qty-appr">อนุมัติ</th>
                            <th class="col-lot">Lot</th>
                            <th class="col-exp">Exp.</th>
                            <th class="col-remark">หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (requisitionItems && requisitionItems.length > 0) {
        requisitionItems.forEach((item, index) => {
            printHtml += `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${item.medicine_code || '-'}</td>
                    <td>${item.generic_name}</td>
                    <td>${item.strength || '-'}</td>
                    <td>${item.unit}</td>
                    <td class="text-center">${item.quantity_requested}</td>
                    <td class="text-center">${item.item_approval_status === 'ปฏิเสธ' ? 'ปฏิเสธ' : (item.quantity_approved !== null ? item.quantity_approved : '-')}</td>
                    <td>${item.approved_lot_number || '-'}</td>
                    <td>${item.approved_expiry_date ? iso_to_thai_date(item.approved_expiry_date) : '-'}</td>
                    <td>${item.reason_for_change_or_rejection || (item.item_approval_status === 'ปฏิเสธ' && !item.reason_for_change_or_rejection ? 'ปฏิเสธรายการ' : '')}</td>
                </tr>
            `;
        });
    } else {
        printHtml += `<tr><td colspan="10" class="text-center" style="padding: 10px;">-- ไม่มีรายการยา --</td></tr>`;
    }

    printHtml += `
                    </tbody>
                </table>

                <div class="signature-section">
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-name">( ${requisitionHeader.requester_name || '...................................'} )</div>
                        <div class="signature-role">ผู้ขอเบิก</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div class="signature-name">( ${requisitionHeader.approved_by_name || '...................................'} )</div>
                        <div class="signature-role">ผู้อนุมัติ</div>
                    </div>
                </div>
                <div class="footer">
                    พิมพ์เมื่อ: ${printDateTimeThai} โดย: ${currentUser.full_name || 'ผู้ใช้ระบบ'}
                </div>
            </div>
            <script>
                 window.onload = function() { 
                     setTimeout(function() {
                         window.print();
                         window.onafterprint = function() { 
                            //  window.close(); // Uncomment if you want the window to close automatically after printing/canceling
                         };
                     }, 250); // Delay to ensure content is rendered
                 }
            </script>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank', 'width=800,height=600'); // Open with specific size for preview
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    
    // The window.print() is now called from within the new window's onload script.
}
