// utils.js

// --- Global Constants ---
const API_BASE_URL = 'http://127.0.0.1:5000/api'; // URL ของ Backend API
let currentSuggestionIndex = -1; // Used by navigateSuggestions, keep it accessible

// --- Helper Functions for Date Formatting ---
/**
 * Formats a Date object or ISO string to dd/mm/yyyy (Buddhist Era).
 * @param {Date|string|null} dateInput - The date to format.
 * @returns {string} Formatted date string or '-'.
 */
function formatDateToThaiString(dateInput) {
    if (!dateInput) return '-';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) { 
        // console.warn("Invalid date input for formatDateToThaiString:", dateInput); // Can be noisy
        return '-'; 
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear() + 543; 
    return `${day}/${month}/${year}`;
}

/**
 * Gets the current date as dd/mm/yyyy (Buddhist Era) string.
 * @returns {string} Current date string.
 */
function getCurrentThaiDateString() {
    return formatDateToThaiString(new Date());
}

/**
 * Parses a dd/mm/yyyy (Buddhist Era) string to a JavaScript Date object.
 * @param {string} thaiDateString - The Thai date string.
 * @returns {Date|null} Date object or null if format is invalid.
 */
function parseThaiDateStringToDate(thaiDateString) {
    if (!thaiDateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(thaiDateString)) {
        // console.warn("Invalid Thai date string format for parsing:", thaiDateString); 
        return null;
    }
    const parts = thaiDateString.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const buddhistYear = parseInt(parts[2], 10);

    if (buddhistYear < 2500) { 
        // console.warn("Buddhist year seems too low for parsing:", buddhistYear);
        return null;
    }
    const christianYear = buddhistYear - 543;

    const date = new Date(christianYear, month, day);
    if (date.getFullYear() === christianYear && date.getMonth() === month && date.getDate() === day) {
        return date;
    }
    // console.warn("Failed to parse Thai date after construction:", thaiDateString);
    return null;
}

/**
 * Converts a dd/mm/yyyy (Buddhist Era) string to an ISO date string (YYYY-MM-DD).
 * @param {string} thaiDateString - The Thai date string (dd/mm/yyyy BE).
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null if format is invalid.
 */
function thai_to_iso_date_frontend(thaiDateString) {
    const dateObject = parseThaiDateStringToDate(thaiDateString);
    if (dateObject) {
        const year = dateObject.getFullYear();
        const month = String(dateObject.getMonth() + 1).padStart(2, '0');
        const day = String(dateObject.getDate()).padStart(2, '0');
        return `<span class="math-inline">\{year\}\-</span>{month}-${day}`;
    }
    return null;
}

/**
 * Converts an ISO date string (YYYY-MM-DD) or a Date object to a Thai date string (dd/mm/yyyy BE).
 * @param {string|Date|null} isoOrDateObject - The ISO date string or Date object.
 * @returns {string} Formatted Thai date string or '-'.
 */
function iso_to_thai_date(isoOrDateObject) {
    if (!isoOrDateObject) return '-';
    try {
        let date_obj;
        if (typeof isoOrDateObject === 'string') {
            // Attempt to parse if it's a string, could be YYYY-MM-DD or full ISO timestamp
            date_obj = new Date(isoOrDateObject);
        } else if (isoOrDateObject instanceof Date) {
            date_obj = isoOrDateObject;
        } else {
            // console.warn("iso_to_thai_date: Unrecognized input type", isoOrDateObject);
            return '-';
        }

        if (isNaN(date_obj.getTime())) {
            // console.warn("iso_to_thai_date: Invalid date after parsing", isoOrDateObject);
            return '-';
        }

        const day = String(date_obj.getDate()).padStart(2, '0');
        const month = String(date_obj.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
        const year = date_obj.getFullYear() + 543;
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error("Error in iso_to_thai_date:", error, "Input:", isoOrDateObject);
        return '-';
    }
}


/**
 * Auto-formats date input to dd/mm/yyyy as user types.
 * @param {Event} event - The input event.
 */
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

/**
 * Calculates the current fiscal year range (October 1st to September 30th).
 * @returns {object} Object with startDate and endDate in dd/mm/yyyy (Buddhist Era) format.
 */
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

// --- API Interaction Helper ---
/**
 * Generic function to fetch data from the API.
 * @param {string} endpoint - The API endpoint (e.g., '/medicines').
 * @param {object} options - Fetch options (method, headers, body).
 * @returns {Promise<any>} The JSON response from the API.
 */
async function fetchData(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            let errorData = { message: `HTTP error! Status: ${response.status}` };
            try {
                errorData = await response.json();
            } catch (e) {
                // Ignore if response is not JSON, use the generic HTTP error
            }
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

// --- Dynamic Form Row and Medicine Search Helpers ---

/**
 * Handles live search for medicines as the user types.
 * @param {Event} event - The input event.
 * @param {number} rowIndex - The index of the row (for targeting specific hidden inputs).
 * @param {string} hcodeContext - The hcode context for searching medicines.
 * @param {string|function|null} callbackOnSelect - Optional callback function or its name (string) to execute after a medicine is selected.
 */
async function handleMedicineSearch(event, rowIndex, hcodeContext, callbackOnSelect = null) {
    const inputElement = event.target;
    const searchTerm = inputElement.value;
    const itemRowElement = inputElement.closest('.flex.items-center.space-x-2'); 
    if (!itemRowElement) {
        console.error("Could not find parent item row for medicine search input.");
        return;
    }
    const suggestionsBox = itemRowElement.querySelector('.suggestions-box');
    const hiddenMedIdInput = itemRowElement.querySelector(`input[name*="[medicine_id]"]`);


    if (event.type === 'input') { 
        currentSuggestionIndex = -1; 
    }

    if (searchTerm.length < 1 && event.type === 'input') { 
        if(suggestionsBox) {
            suggestionsBox.innerHTML = '';
            suggestionsBox.classList.add('hidden');
        }
        if(hiddenMedIdInput) hiddenMedIdInput.value = ''; 
        if (typeof callbackOnSelect === 'function') {
            callbackOnSelect(null, itemRowElement, hcodeContext); 
        } else if (typeof callbackOnSelect === 'string' && typeof window[callbackOnSelect] === 'function') {
            window[callbackOnSelect](null, itemRowElement, hcodeContext);
        }
        return;
    }
    
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key) && suggestionsBox && !suggestionsBox.classList.contains('hidden')) {
        return;
    }

    if (!hcodeContext && currentUser && currentUser.role !== 'ผู้ดูแลระบบ') {
        console.warn("Hcode context is required for medicine search for non-admin users.");
        if(suggestionsBox) {
            suggestionsBox.innerHTML = '<div class="p-2 text-orange-500 text-sm">ไม่สามารถค้นหายาได้: ไม่พบหน่วยบริการ</div>';
            suggestionsBox.classList.remove('hidden');
        }
        if(hiddenMedIdInput) hiddenMedIdInput.value = '';
        return;
    }
    
    const searchParams = new URLSearchParams({ term: searchTerm });
    if (hcodeContext) { 
        searchParams.append('hcode', hcodeContext);
    }

    try {
        const medicines = await fetchData(`/medicines/search?${searchParams.toString()}`);
        
        if(suggestionsBox) suggestionsBox.innerHTML = '';
        if (medicines && medicines.length > 0) {
            medicines.forEach((med) => { 
                const suggestionItem = document.createElement('div');
                suggestionItem.classList.add('p-2', 'hover:bg-gray-100', 'cursor-pointer', 'text-sm', 'suggestion-item');
                suggestionItem.textContent = `${med.medicine_code} - ${med.generic_name} (${med.strength || 'N/A'})`;
                suggestionItem.dataset.medicineId = med.id; 
                suggestionItem.dataset.medicineDisplayName = `${med.medicine_code} - ${med.generic_name}`;

                suggestionItem.addEventListener('click', () => {
                    inputElement.value = suggestionItem.dataset.medicineDisplayName; 
                    if(hiddenMedIdInput) hiddenMedIdInput.value = suggestionItem.dataset.medicineId; 
                    if(suggestionsBox) {
                        suggestionsBox.innerHTML = '';
                        suggestionsBox.classList.add('hidden');
                    }
                    currentSuggestionIndex = -1;
                    if (typeof callbackOnSelect === 'function') {
                        callbackOnSelect(med.id, itemRowElement, hcodeContext);
                    } else if (typeof callbackOnSelect === 'string' && typeof window[callbackOnSelect] === 'function') {
                        window[callbackOnSelect](med.id, itemRowElement, hcodeContext);
                    }
                });
                if(suggestionsBox) suggestionsBox.appendChild(suggestionItem);
            });
            if(suggestionsBox) suggestionsBox.classList.remove('hidden');
        } else {
            if(suggestionsBox) {
                suggestionsBox.innerHTML = '<div class="p-2 text-gray-500 text-sm">ไม่พบยาที่ค้นหา</div>';
                suggestionsBox.classList.remove('hidden');
            }
            if(hiddenMedIdInput) hiddenMedIdInput.value = ''; 
            if (typeof callbackOnSelect === 'function') {
                callbackOnSelect(null, itemRowElement, hcodeContext);
            } else if (typeof callbackOnSelect === 'string' && typeof window[callbackOnSelect] === 'function') {
                window[callbackOnSelect](null, itemRowElement, hcodeContext);
            }
        }
    } catch (error) {
        if(suggestionsBox) {
            suggestionsBox.innerHTML = '<div class="p-2 text-red-500 text-sm">เกิดข้อผิดพลาดในการค้นหา</div>';
            if (!suggestionsBox.classList.contains('hidden')) { 
                 suggestionsBox.classList.remove('hidden');
            }
        }
         if(hiddenMedIdInput) hiddenMedIdInput.value = '';
         if (typeof callbackOnSelect === 'function') {
            callbackOnSelect(null, itemRowElement, hcodeContext);
        } else if (typeof callbackOnSelect === 'string' && typeof window[callbackOnSelect] === 'function') {
            window[callbackOnSelect](null, itemRowElement, hcodeContext);
        }
    }
}

/**
 * Handles keyboard navigation (ArrowUp, ArrowDown, Enter, Escape) for suggestion boxes.
 * @param {Event} event - The keydown event.
 * @param {number} rowIndex - The index of the row (for targeting specific elements).
 */
function navigateSuggestions(event, rowIndex) {
    const inputElement = event.target;
    const itemRowElement = inputElement.closest('.flex.items-center.space-x-2');
    if (!itemRowElement) return;
    const suggestionsBox = itemRowElement.querySelector('.suggestions-box');
    if (!suggestionsBox) return;
    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    
    const hcodeCtx = inputElement.dataset.hcodeContext || (currentUser ? currentUser.hcode : '');
    const callbackNameForNav = inputElement.dataset.medicineSelectCallback;

    if (suggestionsBox.classList.contains('hidden') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        handleMedicineSearch({ target: inputElement, type: 'input' }, rowIndex, hcodeCtx, callbackNameForNav); 
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

/**
 * Adds a dynamic row of input fields to a container.
 * @param {string} containerId - The ID of the container element.
 * @param {string[]} fieldTypes - Array of input types (e.g., 'medicine-search', 'number', 'text', 'date-thai', 'lot-select', 'expiry-display').
 * @param {string[]} placeholders - Array of placeholders for the inputs.
 * @param {string[]} baseFieldNames - Array of base names for the inputs (used for `name` attribute).
 * @param {string|null} arrayName - Optional name for the array if inputs are part of a list (e.g., 'items').
 * @param {string} hcodeContextForSearch - Optional hcode to pass to medicine search for this row.
 * @param {string|null} medicineSelectCallbackName - Optional name of the callback function for medicine selection.
 */
function addDynamicItemRow(containerId, fieldTypes, placeholders, baseFieldNames, arrayName = null, hcodeContextForSearch = '', medicineSelectCallbackName = null) {
    const itemsContainer = document.getElementById(containerId);
    if (!itemsContainer) {
        console.error(`Container with ID '${containerId}' not found.`);
        return;
    }
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
            const callbackString = medicineSelectCallbackName ? `'${medicineSelectCallbackName}'` : 'null';
            inputHtml = `
                <div class="relative flex-grow"> <input type="text" 
                           placeholder="${placeholder}" 
                           class="${fieldClass} medicine-search-input w-full" 
                           name="${displayName}" 
                           oninput="handleMedicineSearch(event, ${itemCount}, '${hcodeContextForSearch}', ${callbackString})" 
                           onkeydown="navigateSuggestions(event, ${itemCount})"
                           data-hcode-context="${hcodeContextForSearch}"
                           data-medicine-select-callback="${medicineSelectCallbackName || ''}"
                           data-row-index="${itemCount}"
                           autocomplete="off"
                           required>
                    <input type="hidden" name="${name}">
                    <div class="suggestions-box absolute top-full left-0 z-10 w-full bg-white border border-gray-300 rounded-md mt-1 shadow-lg hidden max-h-40 overflow-y-auto"></div>
                </div>
            `;
        } else if (type === 'lot-select') {
            fieldClass = 'input-field w-48 !mb-0 lot-number-select';
            inputHtml = `<select name="${name}" class="${fieldClass}" required disabled><option value="">-- เลือกยาก่อน --</option></select>`;
        } else if (type === 'expiry-display') {
            fieldClass = 'input-field w-32 !mb-0 dispense-expiry-date thai-date-formatter'; 
            inputHtml = `<input type="text" placeholder="${placeholder}" class="${fieldClass}" name="${name}" readonly required>`;
        }
        else { 
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

    const newLotSelect = newItemRow.querySelector('.lot-number-select');
    const newExpDateInput = newItemRow.querySelector('.dispense-expiry-date'); 
    const newLotQtyDisplay = newItemRow.querySelector('.lot-quantity-display'); 

    if (newLotSelect && newExpDateInput) { 
        newLotSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset.exp) {
                newExpDateInput.value = selectedOption.dataset.exp; 
                if (newLotQtyDisplay) {
                    newLotQtyDisplay.textContent = `(มี ${selectedOption.dataset.qty || 0})`;
                    newLotQtyDisplay.title = `มี ${selectedOption.dataset.qty || 0} ในสต็อก`;
                }
            } else {
                newExpDateInput.value = '';
                if (newLotQtyDisplay) {
                    newLotQtyDisplay.textContent = '';
                    newLotQtyDisplay.title = '';
                }
            }
        });
    }
}