// modal.js

/**
 * Opens a modal dialog with a smooth animation.
 * @param {string} modalId - The ID of the modal element to open.
 */
function openModal(modalId) {
    console.log('Attempting to open modal with ID:', modalId); // For debugging
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal element not found for ID:', modalId);
        return;
    }
    modal.style.display = 'block'; // Make modal visible to allow transition
    // Using a short timeout to ensure 'display: block' is rendered before adding 'active' class for transition
    setTimeout(() => {
        modal.classList.add('active');
    }, 10); // A small delay like 10ms is usually enough
    console.log('Modal display set to block and active class added (attempted).'); // For debugging
}

/**
 * Closes a modal dialog with a smooth animation and resets its content.
 * @param {string} modalId - The ID of the modal element to close.
 */
function closeModal(modalId) {
    console.log('Attempting to close modal with ID:', modalId); // For debugging
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal element not found for ID:', modalId);
        return;
    }
    modal.classList.remove('active'); // Start the closing animation
    
    let transitionEnded = false;
    const transitionEndHandler = () => {
        if (!transitionEnded) {
            transitionEnded = true;
            modal.style.display = 'none'; // Hide modal after transition
            const modalBody = modal.querySelector('#modalBody'); 
            if (modalBody) {
                modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>'; // Reset modal body content
            }
            modal.removeEventListener('transitionend', transitionEndHandler);
            console.log('Modal closed and display set to none via transitionend.'); // For debugging
        }
    };
    
    // Listen for the end of the CSS transition
    modal.addEventListener('transitionend', transitionEndHandler);

    // Fallback timeout in case transitionend doesn't fire (e.g., no transition defined or interrupted)
    setTimeout(() => {
        if (!transitionEnded) { // If transitionend didn't fire
            modal.style.display = 'none';
            const modalBody = modal.querySelector('#modalBody');
            if (modalBody) {
                modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>';
            }
            modal.removeEventListener('transitionend', transitionEndHandler); // Clean up just in case
            console.log('Modal closed and display set to none via timeout fallback.'); // For debugging
        }
    }, 350); // This duration should be slightly longer than your CSS transition duration (e.g., 0.3s = 300ms)
}
