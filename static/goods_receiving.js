// goods_receiving.js

/**
 * Loads and displays requisitions that are approved and ready for goods receiving
 * for the current user's hcode.
 */
async function loadAndDisplayApprovedRequisitionsForReceiving() {
    const tableBody = document.getElementById("goodsReceivingTableBody");
    if (!tableBody) {
        console.error("Table body for goods receiving (approved requisitions) not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลใบเบิกที่รอรับยา...</td></tr>';

    if (!currentUser || !currentUser.hcode) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">ไม่สามารถโหลดข้อมูลได้: ไม่พบรหัสหน่วยบริการผู้ใช้</td></tr>';
        console.warn("Cannot load approved requisitions: User hcode not available.");
        return;
    }

    const startDate = document.getElementById('startDateRecv')?.value; 
    const endDate = document.getElementById('endDateRecv')?.value;
    
    const params = new URLSearchParams();
    params.append('hcode', currentUser.hcode); 
    params.append('role', currentUser.role); 
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('_cb', new Date().getTime()); // Cache-busting parameter

    try {
        const endpoint = `/requisitions?${params.toString()}`;
        const requisitions = await fetchData(endpoint); 
        
        tableBody.innerHTML = ''; 

        if (!Array.isArray(requisitions)) { 
            console.error("Received non-array data for requisitions:", requisitions);
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">ข้อมูลใบเบิกที่ได้รับไม่ถูกต้อง</td></tr>';
            return;
        }

        const filteredRequisitions = requisitions.filter(
            req => req.requester_hcode === currentUser.hcode && (req.status === 'อนุมัติแล้ว' || req.status === 'อนุมัติบางส่วน')
        );

        if (!filteredRequisitions || filteredRequisitions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบใบเบิกที่อนุมัติแล้วและรอรับยา</td></tr>';
            return;
        }

        filteredRequisitions.forEach(req => {
            const row = tableBody.insertRow();
            let statusClass = req.status === 'อนุมัติแล้ว' ? 'bg-blue-100 text-blue-800' : 'bg-indigo-100 text-indigo-800';
            
            // Backend should send 'approval_date' pre-formatted as dd/mm/yyyy (Thai) or null
            const displayApprovalDate = req.approval_date || 'N/A'; 
            const approverNameDisplay = req.approved_by_name || 'N/A';

            row.innerHTML = `
                <td>${req.requisition_number}</td>
                <td>${displayApprovalDate}</td>
                <td>${approverNameDisplay}</td>
                <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${req.status}</span></td>
                <td>
                    <button onclick='openReceiveGoodsModal(${req.id}, "${req.requisition_number}", "${displayApprovalDate}", "${approverNameDisplay}")' 
                            class="btn btn-success btn-sm text-xs px-2 py-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-box-arrow-in-down mr-1" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M3.5 10a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5-.5h-2a.5.5 0 0 0 0 1h2A1.5 1.5 0 0 0 14 9.5v-8A1.5 1.5 0 0 0 12.5 0h-9A1.5 1.5 0 0 0 2 1.5v8A1.5 1.5 0 0 0 3.5 11h2a.5.5 0 0 0 0-1z"/><path fill-rule="evenodd" d="M7.646 15.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 14.293V5.5a.5.5 0 0 0-1 0v8.793l-2.146-2.147a.5.5 0 0 0-.708.708z"/></svg>
                        ยืนยันการรับยา
                    </button>
                </td>
            `;
        });
    } catch (error) {
        console.error("Error in loadAndDisplayApprovedRequisitionsForReceiving:", error); 
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิกที่รอรับยา: ${error.message}</td></tr>`;
    }
}

async function openReceiveGoodsModal(requisitionId, requisitionNumber, approvalDateStr, approverName) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser || !currentUser.hcode) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ข้อมูลผู้ใช้หรือหน่วยบริการไม่ครบถ้วน', 'error');
        return;
    }

    modalTitle.textContent = `ยืนยันการรับยาจากใบเบิก: ${requisitionNumber}`;
    modalBody.innerHTML = `<p class="text-center text-gray-400 py-4">กำลังโหลดรายการยาที่อนุมัติ...</p>`;
    openModal('formModal'); 

    try {
        const approvedItems = await fetchData(`/requisitions/${requisitionId}/items`);
        let itemsHtml = '';
        if (approvedItems && approvedItems.length > 0) {
            approvedItems.forEach((item, index) => {
                if (item.item_approval_status === 'อนุมัติ' || item.item_approval_status === 'แก้ไขจำนวน') {
                    const expDateValue = item.approved_expiry_date && item.approved_expiry_date !== '-' ? item.approved_expiry_date : getCurrentThaiDateString();
                    itemsHtml += `
                        <tr data-medicine-id="${item.medicine_id}" data-requisition-item-id="${item.requisition_item_id}">
                            <td>${item.medicine_code || '-'} - ${item.generic_name} (${item.strength || 'N/A'})</td>
                            <td class="text-center">${item.quantity_approved} ${item.unit}</td>
                            <td><input type="text" name="items[${index}][lot_number]" class="input-field !p-1.5 text-sm w-32 !mb-0" value="${item.approved_lot_number || ''}" required></td>
                            <td><input type="text" name="items[${index}][expiry_date]" class="input-field !p-1.5 text-sm w-36 !mb-0 thai-date-formatter" placeholder="dd/mm/yyyy" value="${expDateValue}" required></td>
                            <td><input type="number" name="items[${index}][quantity_received]" class="input-field !p-1.5 text-sm w-24 !mb-0" value="${item.quantity_approved}" min="0" max="${item.quantity_approved}" required></td>
                            <td><input type="text" name="items[${index}][notes]" class="input-field !p-1.5 text-sm !mb-0" placeholder="ถ้ามี"></td>
                        </tr>
                    `;
                }
            });
            if (!itemsHtml) {
                 itemsHtml = '<tr><td colspan="6" class="text-center text-gray-500 py-3">ไม่พบรายการยาที่อนุมัติให้รับสำหรับใบเบิกนี้</td></tr>';
            }
        } else {
            itemsHtml = '<tr><td colspan="6" class="text-center text-gray-500 py-3">ไม่พบรายการยาในใบเบิกนี้</td></tr>';
        }

        modalBody.innerHTML = `
            <form id="receiveGoodsForm">
                <input type="hidden" name="requisition_id" value="${requisitionId}">
                <input type="hidden" name="hcode" value="${currentUser.hcode}">
                <input type="hidden" name="receiver_id" value="${currentUser.id}">

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 mb-4">
                    <div>
                        <label class="label">วันที่อนุมัติ (จากใบเบิก):</label>
                        <p class="text-sm text-gray-700">${approvalDateStr ? approvalDateStr : '-'}</p>
                    </div>
                    <div>
                        <label class="label">ผู้อนุมัติ (รพ.แม่ข่าย):</label>
                        <p class="text-sm text-gray-700">${approverName || '-'}</p>
                    </div>
                </div>
                <div class="mb-4">
                    <label for="receiveActualDate" class="label">วันที่รับยาจริง:</label>
                    <input type="text" id="receiveActualDate" name="received_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
                </div>
                 <div class="mb-4">
                    <label for="supplierNameGoodsIn" class="label">ผู้ส่ง/แหล่งที่มา:</label>
                    <input type="text" id="supplierNameGoodsIn" name="supplier_name" class="input-field" value="${approverName ? 'รพ.แม่ข่าย (' + approverName + ')' : 'รพ.แม่ข่าย'}" placeholder="เช่น รพ.แม่ข่าย, ชื่อบริษัท">
                </div>
                 <div class="mb-4">
                    <label for="invoiceNumberGoodsIn" class="label">เลขที่ใบส่งของ/ใบกำกับ (ถ้ามี):</label>
                    <input type="text" id="invoiceNumberGoodsIn" name="invoice_number" class="input-field" placeholder="INV-XXXXX">
                </div>

                <h4 class="font-semibold mb-2 text-gray-700 mt-6">รายการยาที่ได้รับ:</h4>
                <div class="overflow-x-auto mb-4">
                    <table class="custom-table text-sm">
                        <thead>
                            <tr>
                                <th>ชื่อยา</th>
                                <th class="text-center">จำนวนอนุมัติ</th>
                                <th>เลขที่ล็อต (ที่ได้รับ)</th>
                                <th>วันหมดอายุ (ที่ได้รับ)</th>
                                <th class="text-center">จำนวนรับจริง</th>
                                <th>หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody id="receiveGoodsItemsTableBody">
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>
                <div class="mb-4">
                     <label for="receiveRemarks" class="label">หมายเหตุการรับยาเพิ่มเติม:</label>
                     <textarea id="receiveRemarks" name="remarks" class="input-field" rows="2" placeholder="รายละเอียดเพิ่มเติม..."></textarea>
                </div>
                 <div class="flex justify-end space-x-3 mt-6">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                    <button type="submit" class="btn btn-success">ยืนยันการรับยา</button>
                </div>
            </form>
        `;
        
        document.getElementById('receiveGoodsForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const goodsReceivedData = {
                requisition_id: parseInt(formData.get('requisition_id')) || null,
                received_date: formData.get('received_date'), 
                receiver_id: parseInt(formData.get('receiver_id')), 
                hcode: formData.get('hcode'),
                supplier_name: formData.get('supplier_name'),
                invoice_number: formData.get('invoice_number'),
                remarks: formData.get('remarks'),
                items: []
            };

            const itemRows = document.querySelectorAll('#receiveGoodsItemsTableBody tr');
            itemRows.forEach((row) => { 
                const medicineId = row.dataset.medicineId; 
                if (!medicineId) return; 

                const lotInput = row.querySelector(`input[name*="[lot_number]"]`); 
                const expDateInput = row.querySelector(`input[name*="[expiry_date]"]`);
                const qtyReceivedInput = row.querySelector(`input[name*="[quantity_received]"]`);
                const notesInput = row.querySelector(`input[name*="[notes]"]`);

                if (lotInput && lotInput.value && expDateInput && expDateInput.value && qtyReceivedInput && qtyReceivedInput.value) {
                     goodsReceivedData.items.push({
                        medicine_id: parseInt(medicineId),
                        lot_number: lotInput.value,
                        expiry_date: expDateInput.value, 
                        quantity_received: parseInt(qtyReceivedInput.value),
                        notes: notesInput ? notesInput.value : ''
                    });
                }
            });

            if (goodsReceivedData.items.length === 0 && approvedItems && approvedItems.filter(item => item.item_approval_status === 'อนุมัติ' || item.item_approval_status === 'แก้ไขจำนวน').length > 0) {
                Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกการรับยาได้เนื่องจากไม่มีรายการยาที่ถูกต้อง หรือจำนวนรับเป็นศูนย์', 'error');
                return;
            }
            
            try {
                const responseData = await fetchData('/goods_received', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(goodsReceivedData)
                });
                Swal.fire('รับยาสำเร็จ!', responseData.message || `บันทึกการรับยาสำหรับใบเบิก ${requisitionNumber} เรียบร้อยแล้ว สต็อกยาได้รับการอัปเดต`, 'success');
                closeModal('formModal');
                if (typeof loadAndDisplayApprovedRequisitionsForReceiving === 'function') loadAndDisplayApprovedRequisitionsForReceiving();
                if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary();
                if (typeof loadAndDisplayRequisitions === 'function') loadAndDisplayRequisitions(); 
            } catch (error) {
                // Error handled by fetchData
            }
        });

    } catch (error) {
        modalBody.innerHTML = `<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลใบเบิก: ${error.message}</p>
                               <div class="flex justify-end mt-6"><button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button></div>`;
    }
}


function openManualGoodsReceiveModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser || !currentUser.hcode) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ข้อมูลผู้ใช้หรือหน่วยบริการไม่ครบถ้วน', 'error');
        return;
    }
    const hcodeForReceive = currentUser.hcode;

    modalTitle.textContent = `รับยาเข้าคลัง (กรอกเอง/ซื้อตรง) - หน่วยบริการ: ${hcodeForReceive}`;
    modalBody.innerHTML = `
        <form id="manualReceiveGoodsForm">
            <input type="hidden" name="hcode" value="${hcodeForReceive}">
            <input type="hidden" name="receiver_id" value="${currentUser.id}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                <div class="mb-4">
                    <label for="manualReceiveDate" class="label">วันที่รับยา:</label>
                    <input type="text" id="manualReceiveDate" name="received_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${getCurrentThaiDateString()}" required>
                </div>
                <div class="mb-4">
                    <label for="manualSupplierName" class="label">ผู้ส่ง/แหล่งที่มา:</label>
                    <input type="text" id="manualSupplierName" name="supplier_name" class="input-field" placeholder="เช่น ชื่อบริษัท, รพ.แม่ข่าย" required>
                </div>
            </div>
            <div class="mb-4">
                <label for="manualInvoiceNumber" class="label">เลขที่ใบส่งของ/ใบกำกับ (ถ้ามี):</label>
                <input type="text" id="manualInvoiceNumber" name="invoice_number" class="input-field" placeholder="INV-XXXXX">
            </div>
             <div class="mb-4">
                 <label for="manualReceiveRemarks" class="label">หมายเหตุการรับยา:</label>
                 <textarea id="manualReceiveRemarks" name="remarks" class="input-field" rows="2" placeholder="รายละเอียดเพิ่มเติม..."></textarea>
            </div>
            
            <hr class="my-6">

            <div class="mb-4">
                <label class="label">รายการยาที่รับเข้า:</label>
                <div id="manualReceiveItemsContainer">
                    </div>
                <button type="button" class="btn btn-success btn-sm text-xs mt-2" 
                        onclick="addDynamicItemRow('manualReceiveItemsContainer', ['medicine-search', 'text', 'date-thai', 'number'], ['ค้นหารหัสยา/ชื่อยา', 'เลขที่ล็อต', 'dd/mm/yyyy', 'จำนวนรับ'], ['medicine_id', 'lot_number', 'expiry_date', 'quantity_received'], 'items', '${hcodeForReceive}', null)">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-lg mr-1" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/></svg>
                    เพิ่มรายการยา
                </button>
            </div>

             <div class="flex justify-end space-x-3 mt-8">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกการรับยา</button>
            </div>
        </form>
    `;
    openModal('formModal');
    addDynamicItemRow('manualReceiveItemsContainer', 
        ['medicine-search', 'text', 'date-thai', 'number'], 
        ['ค้นหารหัสยา/ชื่อยา', 'เลขที่ล็อต', 'dd/mm/yyyy', 'จำนวนรับ'], 
        ['medicine_id', 'lot_number', 'expiry_date', 'quantity_received'], 
        'items', 
        hcodeForReceive, 
        null 
    );


    document.getElementById('manualReceiveGoodsForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const goodsReceivedData = {
            hcode: formData.get('hcode'),
            received_date: formData.get('received_date'), 
            receiver_id: parseInt(formData.get('receiver_id')),
            supplier_name: formData.get('supplier_name'),
            invoice_number: formData.get('invoice_number'),
            remarks: formData.get('remarks'),
            items: []
        };

        const itemRows = document.querySelectorAll('#manualReceiveItemsContainer > div');
        let allItemsValid = true;
        itemRows.forEach((row, index) => {
            const medIdInput = row.querySelector(`input[name="items[${index}][medicine_id]"]`);
            const lotInput = row.querySelector(`input[name="items[${index}][lot_number]"]`);
            const expDateInput = row.querySelector(`input[name="items[${index}][expiry_date]"]`);
            const qtyReceivedInput = row.querySelector(`input[name="items[${index}][quantity_received]"]`);
            //const unitPriceInput = row.querySelector(`input[name="items[${index}][unit_price]"]`);

            if (medIdInput && medIdInput.value && lotInput && lotInput.value && expDateInput && expDateInput.value && qtyReceivedInput && qtyReceivedInput.value) {
                 goodsReceivedData.items.push({
                    medicine_id: parseInt(medIdInput.value),
                    lot_number: lotInput.value,
                    expiry_date: expDateInput.value, 
                    quantity_received: parseInt(qtyReceivedInput.value),
                    //unit_price: unitPriceInput && unitPriceInput.value ? parseFloat(unitPriceInput.value) : 0.00
                });
            } else {
                if(medIdInput.value || lotInput.value || expDateInput.value || qtyReceivedInput.value){
                    allItemsValid = false;
                }
            }
        });
        
        if (!allItemsValid || goodsReceivedData.items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณากรอกข้อมูลรายการยาที่รับเข้าให้ครบถ้วน หรือเพิ่มรายการยาอย่างน้อย 1 รายการ', 'error');
            return;
        }
        
        console.log("Data to send for manual goods received:", JSON.stringify(goodsReceivedData, null, 2));

        try {
            const responseData = await fetchData('/goods_received', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(goodsReceivedData)
            });
            Swal.fire('บันทึกสำเร็จ!', responseData.message || 'บันทึกการรับยาเข้าคลังเรียบร้อยแล้ว', 'success');
            closeModal('formModal');
            if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary();
            if (typeof loadAndDisplayManualGoodsReceivedList === 'function') loadAndDisplayManualGoodsReceivedList(); 
        } catch (error) {
            // Error handled by fetchData
        }
    });
}

async function loadAndDisplayManualGoodsReceivedList() {
    const tableBody = document.getElementById("manualGoodsReceivedTableBody");
    if (!tableBody) {
        console.warn("Table body for manual goods received not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">กำลังโหลดรายการรับยา (กรอกเอง)...</td></tr>';

    if (!currentUser || !currentUser.hcode) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-red-500 py-4">ไม่พบรหัสหน่วยบริการผู้ใช้</td></tr>';
        return;
    }
    
    const params = new URLSearchParams({ 
        hcode: currentUser.hcode, 
        type: 'manual' 
    });
    const startDate = document.getElementById('startDateRecv')?.value; 
    const endDate = document.getElementById('endDateRecv')?.value;
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);


    try {
        const manualReceives = await fetchData(`/goods_received_vouchers?${params.toString()}`); 

        tableBody.innerHTML = '';
        if (!manualReceives || manualReceives.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-gray-500 py-4">ไม่พบรายการรับยา (กรอกเอง) สำหรับหน่วยบริการ ${currentUser.hcode}</td></tr>`;
            return;
        }
        manualReceives.forEach(rec => {
            const row = tableBody.insertRow();
            const detailsJson = JSON.stringify(rec).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
            row.innerHTML = `
                <td>${rec.voucher_number || `GRV-${rec.id}`}</td>
                <td>${rec.received_date}</td> 
                <td>${rec.receiver_name}</td>
                <td>${rec.supplier_name}</td>
                <td class="text-center">${rec.item_count || 0}</td>
                <td>
                    <button onclick='viewManualGoodsReceivedDetails(${rec.id}, ${detailsJson})' class="btn btn-secondary btn-sm text-xs px-2 py-1 mr-1">ดูรายละเอียด</button>
                    </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดรายการรับยา (กรอกเอง)</td></tr>';
    }
}

async function viewManualGoodsReceivedDetails(voucherId, voucherHeaderDetails) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) return;

    if (typeof voucherHeaderDetails === 'string') {
        try {
            voucherHeaderDetails = JSON.parse(voucherHeaderDetails.replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        } catch (e) {
            console.error("Error parsing voucherHeaderDetails:", e);
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแสดงรายละเอียดได้', 'error');
            return;
        }
    }

    modalTitle.textContent = `รายละเอียดการรับยา (กรอกเอง): ${voucherHeaderDetails.voucher_number || `GRV-${voucherId}`}`;
    modalBody.innerHTML = `
        <div class="space-y-3 mb-4">
            <p><strong>เลขที่เอกสาร:</strong> ${voucherHeaderDetails.voucher_number || `GRV-${voucherId}`}</p>
            <p><strong>วันที่รับ:</strong> ${voucherHeaderDetails.received_date}</p>
            <p><strong>ผู้รับ:</strong> ${voucherHeaderDetails.receiver_name}</p>
            <p><strong>แหล่งที่มา/ผู้ขาย:</strong> ${voucherHeaderDetails.supplier_name}</p>
            <p><strong>เลขที่ใบส่งของ:</strong> ${voucherHeaderDetails.invoice_number || '-'}</p>
            <p><strong>หมายเหตุเอกสาร:</strong> ${voucherHeaderDetails.remarks || '-'}</p>
        </div>
        <p class="text-sm text-blue-600 my-3">หากต้องการแก้ไขรายการยา กรุณาลบเอกสารนี้และสร้างใหม่</p>
        <h4 class="font-semibold mb-2 text-gray-700">รายการยาที่รับ:</h4>
        <div class="overflow-x-auto" id="manualReceiveDetailItemsContainerModal">
            <p class="text-center text-gray-400 py-3">กำลังโหลดรายการยา...</p>
        </div>
        <div class="flex justify-end mt-6 space-x-3">
            <button type="button" class="btn btn-warning" onclick='openEditManualGoodsReceiveModal(${voucherId})'>แก้ไขข้อมูลเอกสาร</button>
            <button type="button" class="btn btn-danger" onclick="confirmDeleteManualGoodsReceive(${voucherId}, '${voucherHeaderDetails.voucher_number || `GRV-${voucherId}`}')">ลบเอกสารรับยานี้</button>
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal');

    const itemsContainer = document.getElementById('manualReceiveDetailItemsContainerModal');
    try {
        const items = await fetchData(`/goods_received_vouchers/${voucherId}/items`);
        let itemsTableHtml = `
            <table class="custom-table text-sm">
                <thead>
                    <tr>
                        <th>รหัสยา</th>
                        <th>ชื่อยา</th>
                        <th>Lot No.</th>
                        <th>วันหมดอายุ</th>
                        <th class="text-center">จำนวนรับ</th>
                        <th class="text-right">ราคา/หน่วย</th>
                        <th>หมายเหตุ</th>
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
                        <td class="text-center">${item.quantity_received}</td>
                        <td class="text-right">${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                        <td>${item.notes || '-'}</td>
                    </tr>
                `;
            });
        } else {
            itemsTableHtml += '<tr><td colspan="7" class="text-center text-gray-500 py-3">ไม่พบรายการยาในเอกสารนี้</td></tr>';
        }
        itemsTableHtml += '</tbody></table>';
        itemsContainer.innerHTML = itemsTableHtml;
    } catch (error) {
        itemsContainer.innerHTML = '<p class="text-center text-red-500 py-3">เกิดข้อผิดพลาดในการโหลดรายการยา</p>';
    }
}

async function openEditManualGoodsReceiveModal(voucherId) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody || !currentUser || !currentUser.hcode) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ข้อมูลผู้ใช้หรือหน่วยบริการไม่ครบถ้วน', 'error');
        return;
    }
    modalBody.innerHTML = `<p class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลเอกสารรับยา...</p>`;
    
    if (document.getElementById('formModal').classList.contains('active')) {
         closeModal('formModal'); 
         await new Promise(resolve => setTimeout(resolve, 350)); 
    }
    openModal('formModal');


    try {
        const voucherData = await fetchData(`/goods_received_vouchers/${voucherId}?hcode_context=${currentUser.hcode}`); 
        if (!voucherData) {
            closeModal('formModal'); 
            return; 
        }
        if (voucherData.requisition_id) { 
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแก้ไขเอกสารรับยาที่อ้างอิงใบเบิกได้จากส่วนนี้', 'error');
            closeModal('formModal');
            return;
        }

        modalTitle.textContent = `แก้ไขข้อมูลการรับยา (กรอกเอง): ${voucherData.voucher_number || `GRV-${voucherId}`}`;
        modalBody.innerHTML = `
            <form id="editManualReceiveGoodsForm">
                <input type="hidden" name="voucher_id" value="${voucherId}">
                <input type="hidden" name="hcode_context" value="${currentUser.hcode}"> 
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <div class="mb-4">
                        <label for="editReceiveDate" class="label">วันที่รับยา:</label>
                        <input type="text" id="editReceiveDate" name="received_date" class="input-field thai-date-formatter" placeholder="dd/mm/yyyy" value="${voucherData.received_date_thai}" required>
                    </div>
                    <div class="mb-4">
                        <label for="editSupplierName" class="label">ผู้ส่ง/แหล่งที่มา:</label>
                        <input type="text" id="editSupplierName" name="supplier_name" class="input-field" value="${voucherData.supplier_name || ''}" placeholder="เช่น ชื่อบริษัท, รพ.แม่ข่าย" required>
                    </div>
                </div>
                <div class="mb-4">
                    <label for="editInvoiceNumber" class="label">เลขที่ใบส่งของ/ใบกำกับ (ถ้ามี):</label>
                    <input type="text" id="editInvoiceNumber" name="invoice_number" class="input-field" value="${voucherData.invoice_number || ''}" placeholder="INV-XXXXX">
                </div>
                 <div class="mb-4">
                     <label for="editReceiveRemarks" class="label">หมายเหตุการรับยา:</label>
                     <textarea id="editReceiveRemarks" name="remarks" class="input-field" rows="2" placeholder="รายละเอียดเพิ่มเติม...">${voucherData.remarks || ''}</textarea>
                </div>
                <p class="text-sm text-yellow-600 my-4">หมายเหตุ: การแก้ไขรายการยาในเอกสารนี้ยังไม่รองรับ กรุณาลบและสร้างใหม่หากต้องการแก้ไขรายการยา</p>
                 <div class="flex justify-end space-x-3 mt-6">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
                </div>
            </form>
        `;
        
        document.getElementById('editManualReceiveGoodsForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const updatedData = {
                received_date: formData.get('received_date'),
                supplier_name: formData.get('supplier_name'),
                invoice_number: formData.get('invoice_number'),
                remarks: formData.get('remarks'),
                hcode_context: formData.get('hcode_context') 
            };

            try {
                const responseData = await fetchData(`/goods_received_vouchers/${voucherId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                });
                Swal.fire('สำเร็จ!', responseData.message || 'อัปเดตข้อมูลการรับยาเรียบร้อยแล้ว', 'success');
                closeModal('formModal');
                if (typeof loadAndDisplayManualGoodsReceivedList === 'function') loadAndDisplayManualGoodsReceivedList();
            } catch (error) {
                // Error handled by fetchData
            }
        });

    } catch (error) {
        modalBody.innerHTML = `<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลเอกสารรับยา</p>
                               <div class="flex justify-end mt-6"><button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button></div>`;
    }
}

async function confirmDeleteManualGoodsReceive(voucherId, voucherNumber) {
    if (!currentUser || !currentUser.hcode || !currentUser.id) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดำเนินการได้: ข้อมูลผู้ใช้หรือหน่วยบริการไม่ครบถ้วน', 'error');
        return;
    }
    Swal.fire({
        title: 'ยืนยันการลบเอกสารรับยา',
        html: `คุณต้องการลบเอกสารรับยา <b>${voucherNumber || `ID ${voucherId}`}</b> ใช่หรือไม่?<br><strong class="text-blue-600">การดำเนินการนี้จะพยายามปรับปรุงยอดคงเหลือในคลังยาโดยอัตโนมัติ</strong><br><small>(หากยาใน Lot นี้ถูกจ่ายไปแล้ว อาจทำให้ยอดติดลบได้ กรุณาตรวจสอบ)</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const responseData = await fetchData(`/goods_received_vouchers/${voucherId}?hcode_context=${currentUser.hcode}&user_id_context=${currentUser.id}`, { method: 'DELETE' });
                Swal.fire('ลบสำเร็จ!', responseData.message || `เอกสารรับยา ${voucherNumber || `ID ${voucherId}`} ถูกลบแล้ว และมีการปรับปรุงสต็อก.`, 'success');
                if (typeof loadAndDisplayManualGoodsReceivedList === 'function') loadAndDisplayManualGoodsReceivedList();
                if (typeof loadAndDisplayInventorySummary === 'function') loadAndDisplayInventorySummary(); 
            } catch (error) {
                // Error handled by fetchData (which shows a Swal)
            }
        }
    });
}

