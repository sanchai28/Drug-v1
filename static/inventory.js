// inventory.js

// Assumes currentUser, fetchData, openModal, closeModal, getFiscalYearRange, 
// formatDateToThaiString, iso_to_thai_date, getCurrentThaiDateString
// are globally available (e.g., from main.js, utils.js, modal.js)

/**
 * Fetches and displays the inventory summary for the logged-in user's hcode.
 */
async function loadAndDisplayInventorySummary() {
    const tableBody = document.getElementById("inventoryManagementTableBody");
    if (!tableBody) {
        console.error("Table body for inventory management not found.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลคลังยา...</td></tr>';

    if (!currentUser) { 
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่</td></tr>';
        console.warn("Cannot load inventory: currentUser is not defined.");
        return;
    }

    let endpoint = '/inventory';
    const params = new URLSearchParams();

    if (currentUser.hcode) {
        params.append('hcode', currentUser.hcode);
    } else if (currentUser.role !== 'ผู้ดูแลระบบ') { 
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-orange-500 py-4">ไม่สามารถโหลดข้อมูลคลังยาได้: ไม่พบรหัสหน่วยบริการผู้ใช้</td></tr>';
        console.warn("Cannot load inventory: User hcode not available for non-admin.");
        return;
    }
    
    if (params.toString()) {
        endpoint += `?${params.toString()}`;
    } else if (currentUser.role !== 'ผู้ดูแลระบบ') { 
         tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-orange-500 py-4">กรุณาระบุหน่วยบริการเพื่อดูข้อมูลคลังยา</td></tr>';
        return;
    }


    try {
        const inventorySummary = await fetchData(endpoint); 
        tableBody.innerHTML = ''; 

        if (!inventorySummary || inventorySummary.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-4">ไม่พบข้อมูลคลังยาสำหรับหน่วยบริการ ${currentUser.hcode || '(ไม่ได้ระบุ)'}</td></tr>`;
            return;
        }

        inventorySummary.forEach(item => {
            const row = tableBody.insertRow();
            let statusClass = 'bg-green-100 text-green-800'; 
            if (item.status === 'ใกล้หมด') {
                statusClass = 'bg-yellow-100 text-yellow-800';
            } else if (item.status === 'หมด') {
                statusClass = 'bg-red-100 text-red-800';
            }

            row.innerHTML = `
                <td>${item.medicine_code || '-'}</td>
                <td>${item.generic_name} ${item.strength || ''}</td>
                <td class="text-center">${item.total_quantity_on_hand || 0} ${item.unit}</td>
                <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${item.status}</span></td>
                <td>
                    <button 
                        onclick="openInventoryHistoryModal(${item.medicine_id}, '${item.generic_name} ${item.strength || ''}')" 
                        class="btn btn-secondary btn-sm text-xs px-2 py-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-clock-history mr-1" viewBox="0 0 16 16"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.271l.493-.87a8 8 0 0 1 .979.654l-.615.78A7 7 0 0 0 11.89 2.18zm-7.874.46a7 7 0 0 0 .985-.299l-.219-.976a8 8 0 0 1-1.126.342zM3.515 1.02a8 8 0 0 1-.589-.022L3 0a7 7 0 0 0-.515.019zm-.53 1.16a8 8 0 0 1-.979-.654l.615-.78q.429.428.979.654zM5 3.5c0 .79.305 1.501.804 2.036A4.5 4.5 0 0 1 9 9.5c.79 0 1.5-.305 2.036-.804A4.5 4.5 0 0 1 13.5 5H5zm.5-1a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5M8.5 5.5a.5.5 0 0 0-1 0v3.19l-1.83-1.83a.5.5 0 0 0-.708.708l2.5 2.5a.5.5 0 0 0 .708 0l2.5-2.5a.5.5 0 0 0-.708-.708L8.5 8.31zM8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
                        ดูประวัติ
                    </button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลคลังยา</td></tr>';
    }
}

/**
 * Opens a modal to display the inventory transaction history for a specific medicine,
 * filtered by the current user's hcode and a selectable date range.
 * Data is sorted by date ascending.
 * The balance column now reflects the total stock of the medicine for the hcode after the transaction.
 * @param {number} medicineId - The ID of the medicine (from medicines table, which is hcode-specific).
 * @param {string} medicineName - The name of the medicine for display in the modal title.
 */
async function openInventoryHistoryModal(medicineId, medicineName) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) {
        console.error("Modal elements not found for inventory history.");
        return;
    }

    modalTitle.textContent = `ประวัติยา: ${medicineName} (รหัสยา: ${medicineId})`;
    
    const fiscalYear = typeof getFiscalYearRange === 'function' ? getFiscalYearRange() : { startDate: '', endDate: '' };

    modalBody.innerHTML = `
        <div class="flex flex-col sm:flex-row items-end space-y-2 sm:space-y-0 sm:space-x-3 mb-4 bg-gray-50 p-3 rounded-lg shadow-sm">
            <div>
                <label for="historyStartDate" class="label text-sm">วันที่เริ่มต้น:</label>
                <input type="text" id="historyStartDate" name="historyStartDate" class="input-field !mb-0 !py-2 !px-3 text-sm thai-date-formatter" placeholder="dd/mm/yyyy" value="${fiscalYear.startDate}">
            </div>
            <div>
                <label for="historyEndDate" class="label text-sm">วันที่สิ้นสุด:</label>
                <input type="text" id="historyEndDate" name="historyEndDate" class="input-field !mb-0 !py-2 !px-3 text-sm thai-date-formatter" placeholder="dd/mm/yyyy" value="${fiscalYear.endDate}">
            </div>
            <button id="searchHistoryButton" class="btn btn-primary !py-2 !px-4 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-search mr-2" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
                ค้นหา
            </button>
        </div>
        <div id="inventoryHistoryTableContainer">
            <p class="text-center text-gray-400 py-4">กำลังโหลดประวัติยา...</p>
        </div>
        <div class="flex justify-end mt-6">
            <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ปิด</button>
        </div>
    `;
    openModal('formModal'); 

    const searchButton = document.getElementById('searchHistoryButton');
    if (searchButton) {
        searchButton.addEventListener('click', () => fetchAndDisplayInventoryHistory(medicineId));
    }
    fetchAndDisplayInventoryHistory(medicineId);
}

/**
 * Fetches and displays the actual inventory history in the modal's table container.
 * @param {number} medicineId - The ID of the medicine.
 */
async function fetchAndDisplayInventoryHistory(medicineId) {
    const historyTableContainer = document.getElementById('inventoryHistoryTableContainer');
    if (!historyTableContainer) {
        console.error("Inventory history table container not found in modal.");
        return;
    }
    historyTableContainer.innerHTML = `<p class="text-center text-gray-400 py-4">กำลังโหลดประวัติยา...</p>`;

    if (!currentUser || !currentUser.hcode) { 
        historyTableContainer.innerHTML = `<p class="text-center text-orange-500 py-4">ไม่สามารถโหลดประวัติยาได้: ไม่พบรหัสหน่วยบริการผู้ใช้</p>`;
        return;
    }

    const startDate = document.getElementById('historyStartDate')?.value || '';
    const endDate = document.getElementById('historyEndDate')?.value || '';
    
    let endpoint = `/inventory/history/${medicineId}?hcode=${currentUser.hcode}`;
    if (startDate) endpoint += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) endpoint += `&endDate=${encodeURIComponent(endDate)}`;

    try {
        const history = await fetchData(endpoint); 
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
                            <th class="text-center">ยอดคงเหลือ</th>
                            <th>ผู้ทำรายการ</th>
                            <th>หมายเหตุ/อ้างอิง</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (!history || history.length === 0) {
            historyHtml += `<tr><td colspan="9" class="text-center text-gray-500 py-4">ไม่พบประวัติการเคลื่อนไหวสำหรับยานี้ในหน่วยบริการ ${currentUser.hcode} ${startDate || endDate ? 'ในช่วงวันที่ที่เลือก' : ''}</td></tr>`; // Updated colspan
        } else {
            history.forEach(item => {
                const receivedQty = item.quantity_change > 0 ? item.quantity_change : '-';
                const dispensedQty = item.quantity_change < 0 ? Math.abs(item.quantity_change) : '-';
                historyHtml += `
                    <tr>
                        <td>${item.transaction_date}</td> 
                        <td>${item.transaction_type || '-'}</td>
                        <td>${item.lot_number || '-'}</td>
                        <td>${item.expiry_date || '-'}</td> 
                        <td class="text-center text-green-600">${receivedQty}</td> 
                        <td class="text-center text-red-600">${dispensedQty}</td>  
                        <td class="text-center">${item.quantity_after_transaction}</td> 
                        <td>${item.user_full_name || '-'}</td>
                        <td>${item.remarks || item.reference_document_id || '-'}</td>
                    </tr>
                `;
            });
        }
        historyHtml += `
                    </tbody>
                </table>
            </div>`;
        historyTableContainer.innerHTML = historyHtml;
    } catch (error) {
        historyTableContainer.innerHTML = `<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดประวัติยา: ${error.message}</p>`;
    }
}
