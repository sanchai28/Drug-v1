// admin.js

/**
 * Loads and displays users in the admin user table.
 * Assumes fetchData, openEditUserModal, confirmDeleteUser are defined.
 */
async function loadAndDisplayUsers() {
    const tableBody = document.getElementById("adminUserTableBody");
    if (!tableBody) {
        console.warn("Admin user table body not found. Skipping user list load.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-4">กำลังโหลดข้อมูลผู้ใช้งาน...</td></tr>';
    try {
        const users = await fetchData('/users'); // Assumes fetchData is globally available from utils.js
        tableBody.innerHTML = ''; 

        if (!users || users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-4">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
            return;
        }

        users.forEach(user => {
            const row = tableBody.insertRow();
            const statusText = user.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน';
            const statusClass = user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            // Ensure user object is correctly stringified for onclick event
            const userJsonString = JSON.stringify(user).replace(/"/g, "&quot;").replace(/'/g, "&apos;");

            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.full_name}</td>
                <td>${user.role}</td>
                <td>${user.hcode || '-'}</td>
                <td>${user.hcode_name || (user.hcode ? 'N/A' : '-')}</td>
                <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${statusText}</span></td>
                <td>
                    <button onclick='openEditUserModal(${userJsonString})' class="btn btn-warning btn-sm text-xs px-2 py-1 mr-1">แก้ไข</button>
                    <button onclick="confirmToggleUserStatus(${user.id}, '${user.username}', ${user.is_active})" class="btn ${user.is_active ? 'btn-danger' : 'btn-success'} btn-sm text-xs px-2 py-1">
                        ${user.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้งาน</td></tr>';
    }
}


/**
 * Opens a modal to add a new system user.
 * Assumes openModal, closeModal, fetchData, loadAndDisplayUsers, Swal are globally available.
 */
function openAddNewUserModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) {
        console.error("Modal elements not found for adding new user.");
        return;
    }
    
    modalTitle.textContent = 'เพิ่มผู้ใช้งานใหม่';
    
    // Fetch unit services for dropdown (optional, can be text input too)
    let hcodeOptionsHtml = '<option value="">-- ไม่ระบุหน่วยบริการ --</option>'; 
    fetchData('/unitservices') // Assumes fetchData is available
        .then(services => {
            if (services && services.length > 0) {
                services.forEach(service => {
                    hcodeOptionsHtml += `<option value="${service.hcode}">${service.hcode} - ${service.name}</option>`;
                });
            }
        })
        .catch(error => console.error("Failed to load unit services for user form:", error))
        .finally(() => {
            modalBody.innerHTML = `
                <form id="addNewUserForm">
                    <div class="mb-4">
                        <label for="newUsername" class="label">ชื่อผู้ใช้งาน (Username):</label>
                        <input type="text" id="newUsername" name="username" class="input-field" autocomplete="off" required>
                    </div>
                    <div class="mb-4">
                        <label for="newFullName" class="label">ชื่อ-นามสกุล:</label>
                        <input type="text" id="newFullName" name="full_name" class="input-field" required>
                    </div>
                    <div class="mb-4">
                        <label for="newPassword" class="label">รหัสผ่าน:</label>
                        <input type="password" id="newPassword" name="password" class="input-field" autocomplete="new-password" required>
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
                        <label for="userHcode" class="label">หน่วยบริการ (HCODE ถ้ามี):</label>
                        <select id="userHcode" name="hcode" class="input-field">
                            ${hcodeOptionsHtml}
                        </select>
                     </div>
                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                        <button type="submit" class="btn btn-primary">บันทึกผู้ใช้งาน</button>
                    </div>
                </form>
            `;
            openModal('formModal'); 

            const addUserForm = document.getElementById('addNewUserForm');
            if (addUserForm) {
                addUserForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const userData = Object.fromEntries(formData.entries());
                    if (!userData.hcode) { 
                        delete userData.hcode; 
                    }

                    try {
                        const responseData = await fetchData('/users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(userData)
                        });
                        Swal.fire('สำเร็จ', responseData.message || 'เพิ่มผู้ใช้งานใหม่เรียบร้อยแล้ว', 'success');
                        closeModal('formModal');
                        if (typeof loadAndDisplayUsers === 'function') loadAndDisplayUsers(); 
                    } catch (error) {
                        // Error already handled by fetchData's Swal
                    }
                });
            }
        });
}

/**
 * Opens a modal to edit an existing user.
 * @param {object} userData - The data of the user to edit.
 */
function openEditUserModal(userData) {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = `แก้ไขข้อมูลผู้ใช้: ${userData.username}`;
    
    let hcodeOptionsHtml = '<option value="">-- ไม่ระบุหน่วยบริการ --</option>';
    fetchData('/unitservices')
        .then(services => {
            if (services && services.length > 0) {
                services.forEach(service => {
                    hcodeOptionsHtml += `<option value="${service.hcode}" ${service.hcode === userData.hcode ? 'selected' : ''}>${service.hcode} - ${service.name}</option>`;
                });
            }
        })
        .catch(error => console.error("Failed to load unit services for user edit form:", error))
        .finally(() => {
            modalBody.innerHTML = `
                <form id="editUserForm">
                    <input type="hidden" name="id" value="${userData.id}">
                    <div class="mb-4">
                        <label class="label">Username:</label>
                        <input type="text" class="input-field bg-gray-100" value="${userData.username}" readonly>
                    </div>
                    <div class="mb-4">
                        <label for="editFullName" class="label">ชื่อ-นามสกุล:</label>
                        <input type="text" id="editFullName" name="full_name" class="input-field" value="${userData.full_name}" required>
                    </div>
                    <div class="mb-4">
                        <label for="editUserRole" class="label">บทบาท:</label>
                        <select id="editUserRole" name="role" class="input-field">
                            <option value="เจ้าหน้าที่ รพสต." ${userData.role === 'เจ้าหน้าที่ รพสต.' ? 'selected' : ''}>เจ้าหน้าที่ รพสต.</option>
                            <option value="เจ้าหน้าที่ รพ. แม่ข่าย" ${userData.role === 'เจ้าหน้าที่ รพ. แม่ข่าย' ? 'selected' : ''}>เจ้าหน้าที่ รพ. แม่ข่าย</option>
                            <option value="ผู้ดูแลระบบ" ${userData.role === 'ผู้ดูแลระบบ' ? 'selected' : ''}>ผู้ดูแลระบบ</option>
                        </select>
                    </div>
                    <div class="mb-4">
                        <label for="editUserHcode" class="label">หน่วยบริการ (HCODE ถ้ามี):</label>
                        <select id="editUserHcode" name="hcode" class="input-field">
                            ${hcodeOptionsHtml}
                        </select>
                    </div>
                    <div class="mb-4">
                        <label for="editUserPassword" class="label">รหัสผ่านใหม่ (เว้นว่างไว้หากไม่ต้องการเปลี่ยน):</label>
                        <input type="password" id="editUserPassword" name="password" class="input-field" autocomplete="new-password">
                    </div>
                    <div class="mb-4">
                        <label for="editUserIsActive" class="label">สถานะการใช้งาน:</label>
                        <select id="editUserIsActive" name="is_active" class="input-field">
                            <option value="true" ${userData.is_active ? 'selected' : ''}>ใช้งาน</option>
                            <option value="false" ${!userData.is_active ? 'selected' : ''}>ไม่ใช้งาน</option>
                        </select>
                    </div>
                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                        <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
                    </div>
                </form>
            `;
            openModal('formModal');

            const editForm = document.getElementById('editUserForm');
            if (editForm) {
                editForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const updatedUserData = {};
                    formData.forEach((value, key) => {
                        if (key === 'password' && !value) return; // Don't send empty password
                        if (key === 'is_active') {
                            updatedUserData[key] = value === 'true';
                        } else if (key === 'hcode' && value === "") { // Send null if hcode is empty string
                            updatedUserData[key] = null;
                        }
                        else {
                            updatedUserData[key] = value;
                        }
                    });
                    
                    try {
                        const responseData = await fetchData(`/users/${userData.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updatedUserData)
                        });
                        Swal.fire('สำเร็จ', responseData.message || 'แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว', 'success');
                        closeModal('formModal');
                        if (typeof loadAndDisplayUsers === 'function') loadAndDisplayUsers();
                    } catch (error) {
                        // Error handled by fetchData
                    }
                });
            }
        });
}

/**
 * Confirms and handles toggling user active status.
 * @param {number} userId - The ID of the user.
 * @param {string} username - The username for confirmation message.
 * @param {boolean} isActive - The current active status of the user.
 */
async function confirmToggleUserStatus(userId, username, isActive) {
    const actionText = isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน';
    const newStatus = !isActive;

    Swal.fire({
        title: `ยืนยันการ${actionText}ผู้ใช้`,
        text: `คุณต้องการ${actionText}ผู้ใช้ ${username} (ID: ${userId}) ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: isActive ? '#d33' : '#28a745', // Red for deactivate, Green for activate
        cancelButtonColor: '#6b7280',
        confirmButtonText: `ใช่, ${actionText}!`,
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const responseData = await fetchData(`/users/${userId}`, { 
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: newStatus }) 
                });
                Swal.fire('สำเร็จ!', responseData.message || `ผู้ใช้ ${username} ถูก${actionText}แล้ว.`, 'success');
                if (typeof loadAndDisplayUsers === 'function') loadAndDisplayUsers(); 
            } catch (error) {
                // Error handled by fetchData
            }
        }
    });
}


/**
 * Opens a modal to edit hospital/clinic information (Placeholder).
 * Assumes openModal, closeModal are globally available.
 */
function openEditHospitalInfoModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'แก้ไขข้อมูล รพสต./รพ.แม่ข่าย';
    // In a real application, you would fetch current data for the hospital/clinic
    modalBody.innerHTML = `
        <form id="editHospitalInfoForm">
            <div class="mb-4">
                <label for="hospitalHcode" class="label">รหัสหน่วยบริการ (HCODE):</label>
                <input type="text" id="hospitalHcode" name="hcode" class="input-field" value="10731" readonly>
            </div>
            <div class="mb-4">
                <label for="hospitalName" class="label">ชื่อหน่วยงาน:</label>
                <input type="text" id="hospitalName" name="name" class="input-field" value="รพสต. บ้านสุขภาพดี (ตัวอย่าง)" required>
            </div>
            <div class="mb-4">
                <label for="hospitalAddress" class="label">ที่อยู่:</label>
                <textarea id="hospitalAddress" name="address" class="input-field" rows="3">123 หมู่ 4 ต.สุขใจ อ.เมือง จ.สมหวัง 12345 (ตัวอย่าง)</textarea>
            </div>
             <div class="mb-4">
                <label for="hospitalPhone" class="label">เบอร์โทรศัพท์ติดต่อ:</label>
                <input type="tel" id="hospitalPhone" name="phone" class="input-field" value="02-123-4567 (ตัวอย่าง)">
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button type="button" class="btn btn-secondary" onclick="closeModal('formModal')">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
            </div>
        </form>
    `;
    openModal('formModal');

    const editForm = document.getElementById('editHospitalInfoForm');
    if(editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // TODO: Implement API call to PUT /api/unitservice/{hcode} or similar for the main hospital/clinic
            Swal.fire('สำเร็จ', 'แก้ไขข้อมูลหน่วยงานเรียบร้อยแล้ว (จำลอง)', 'success');
            closeModal('formModal');
        });
    }
}

/**
 * Opens a modal to show summary reports (Placeholder).
 * Assumes openModal, closeModal are globally available.
 */
function openSummaryReportModal() {
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    if (!modalTitle || !modalBody) return;

    modalTitle.textContent = 'รายงานภาพรวม (ตัวอย่าง)';
    // TODO: Fetch actual report data from backend
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
