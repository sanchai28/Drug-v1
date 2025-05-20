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

    // Ensure modal is ready for transition by setting display, then triggering class change
    // This makes the modal element part of the layout and interactive before animation starts.
    modal.style.display = 'flex'; // Use flex as per CSS for centering

    // Using a short timeout to ensure 'display: flex' is rendered before adding 'active' class for transition
    setTimeout(() => {
        modal.classList.add('active');
    }, 10); // A small delay like 10ms is usually enough

    console.log('Modal display set to flex and active class added (attempted).'); // For debugging
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

    const modalContent = modal.querySelector('.modal-content'); // Get the content element

    modal.classList.remove('active'); // Start the closing animation (for backdrop and content)

    let transitionEnded = false;

    const transitionEndHandler = (event) => {
        // Ensure the event is from the modal-content itself and not a child element's transition
        // Also, check if the opacity transition is the one that ended, as it's a good indicator for overall fade-out.
        if (event.target === modalContent && event.propertyName === 'opacity' && !transitionEnded) {
            transitionEnded = true;
            modal.style.display = 'none'; // Hide modal after content's transition
            
            const modalBody = modal.querySelector('#modalBody');
            if (modalBody) {
                modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>'; // Reset modal body content
            }
            
            if (modalContent) {
                modalContent.removeEventListener('transitionend', transitionEndHandler);
            }
            console.log('Modal closed and display set to none via modal-content transitionend.'); // For debugging
        }
    };

    if (modalContent) {
        // Listen for the end of the CSS transition on the modal-content
        modalContent.addEventListener('transitionend', transitionEndHandler);
    } else {
        console.error('Modal content (.modal-content) not found inside modal:', modalId);
        // Fallback if modal-content is not found, though this indicates a structure issue
        setTimeout(() => {
            if (!transitionEnded) {
                 modal.style.display = 'none';
                 const modalBody = modal.querySelector('#modalBody');
                 if (modalBody) {
                    modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>';
                 }
                 console.log('Modal closed (no modal-content found for event listener) via timeout fallback.');
            }
        }, 400); // Adjusted fallback duration
        return;
    }
    

    // Fallback timeout in case transitionend doesn't fire on modal-content
    // This duration should be slightly longer than your CSS transition duration for modal-content
    // CSS for .modal-content: transition: transform 0.3s ... 0.05s, opacity 0.3s ... 0.05s; (total ~350ms)
    setTimeout(() => {
        if (!transitionEnded) { // If transitionend didn't fire
            transitionEnded = true; // Prevent transitionEndHandler from running if it fires late
            modal.style.display = 'none';
            const modalBody = modal.querySelector('#modalBody');
            if (modalBody) {
                modalBody.innerHTML = '<p>กำลังโหลดเนื้อหา...</p>';
            }
            if (modalContent) {
                modalContent.removeEventListener('transitionend', transitionEndHandler); // Clean up
            }
            console.log('Modal closed and display set to none via timeout fallback.'); // For debugging
        }
    }, 400); // Increased fallback to 400ms
}
