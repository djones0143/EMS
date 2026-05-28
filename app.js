// Kentucky EMS Medication Reference App
// Main Application Logic

(function() {
    'use strict';

    // State
    let filteredMedications = [];
    let currentSearchTerm = '';
    let currentCategory = 'all';

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearch');
    const categoryFilter = document.getElementById('categoryFilter');
    const medicationList = document.getElementById('medicationList');
    const medicationCount = document.getElementById('medicationCount');
    const modal = document.getElementById('medicationModal');
    const medicationDetail = document.getElementById('medicationDetail');
    const closeModal = document.querySelector('.close');

    // Initialize app
    function init() {
        filteredMedications = medications;
        renderMedications();
        attachEventListeners();
    }

    // Event Listeners
    function attachEventListeners() {
        searchInput.addEventListener('input', handleSearch);
        clearSearchBtn.addEventListener('click', clearSearch);
        categoryFilter.addEventListener('change', handleCategoryFilter);
        closeModal.addEventListener('click', closeModalView);
        window.addEventListener('click', handleOutsideClick);

        // Keyboard navigation
        document.addEventListener('keydown', handleKeyPress);
    }

    // Handle search input
    function handleSearch(e) {
        currentSearchTerm = e.target.value.toLowerCase().trim();

        // Toggle clear button visibility
        if (currentSearchTerm) {
            clearSearchBtn.classList.add('visible');
        } else {
            clearSearchBtn.classList.remove('visible');
        }

        filterMedications();
    }

    // Clear search
    function clearSearch() {
        searchInput.value = '';
        currentSearchTerm = '';
        clearSearchBtn.classList.remove('visible');
        searchInput.focus();
        filterMedications();
    }

    // Handle category filter
    function handleCategoryFilter(e) {
        currentCategory = e.target.value;
        filterMedications();
    }

    // Filter medications based on search and category
    function filterMedications() {
        filteredMedications = medications.filter(med => {
            // Category filter
            const categoryMatch = currentCategory === 'all' || med.category === currentCategory;

            // Search filter
            const searchMatch = !currentSearchTerm ||
                med.name.toLowerCase().includes(currentSearchTerm) ||
                med.genericName.toLowerCase().includes(currentSearchTerm) ||
                med.category.toLowerCase().includes(currentSearchTerm) ||
                med.indications.some(ind => ind.toLowerCase().includes(currentSearchTerm));

            return categoryMatch && searchMatch;
        });

        renderMedications();
    }

    // Render medication cards
    function renderMedications() {
        medicationList.innerHTML = '';

        // Update count
        const count = filteredMedications.length;
        const total = medications.length;
        medicationCount.textContent = count === total
            ? `Showing all ${total} medications`
            : `Showing ${count} of ${total} medications`;

        if (filteredMedications.length === 0) {
            medicationList.innerHTML = `
                <div class="no-results">
                    <p>No medications found matching your search.</p>
                    <p>Try adjusting your search terms or category filter.</p>
                </div>
            `;
            return;
        }

        filteredMedications.forEach(med => {
            const card = createMedicationCard(med);
            medicationList.appendChild(card);
        });
    }

    // Create medication card element
    function createMedicationCard(med) {
        const card = document.createElement('div');
        card.className = 'medication-card';
        card.setAttribute('data-id', med.id);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        const categoryLabel = getCategoryLabel(med.category);
        const firstIndication = med.indications[0] || 'See details';

        card.innerHTML = `
            <h3>${med.name}</h3>
            <p class="generic-name">${med.genericName}</p>
            <span class="category-badge">${categoryLabel}</span>
            <p class="indication-preview">${firstIndication}</p>
        `;

        card.addEventListener('click', () => showMedicationDetail(med));
        card.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showMedicationDetail(med);
            }
        });

        return card;
    }

    // Get category label
    function getCategoryLabel(category) {
        const labels = {
            'cardiac': 'Cardiac',
            'respiratory': 'Respiratory',
            'neurologic': 'Neurologic',
            'analgesia': 'Analgesia',
            'sedation': 'Sedation',
            'antidotes': 'Antidotes',
            'gi': 'GI/Antiemetic',
            'other': 'Other'
        };
        return labels[category] || category;
    }

    // Show medication detail modal
    function showMedicationDetail(med) {
        const categoryLabel = getCategoryLabel(med.category);

        let detailHTML = `
            <h2>${med.name}</h2>
            <p class="generic-name" style="font-size: 1.1rem; margin-bottom: 20px;">
                Generic: ${med.genericName}
            </p>
            <span class="category-badge" style="font-size: 1rem; padding: 6px 16px;">
                ${categoryLabel}
            </span>

            <div class="detail-section">
                <h3>Indications</h3>
                <ul>
                    ${med.indications.map(ind => `<li>${ind}</li>`).join('')}
                </ul>
            </div>

            <div class="detail-section">
                <h3>Contraindications</h3>
                <ul>
                    ${med.contraindications.map(contra => `<li>${contra}</li>`).join('')}
                </ul>
            </div>

            <div class="detail-section">
                <h3>Dosage</h3>
                <p><strong>Adult:</strong> ${med.dose.adult}</p>
                <p><strong>Pediatric:</strong> ${med.dose.pediatric}</p>
            </div>

            <div class="detail-section">
                <h3>Route & Onset</h3>
                <p><strong>Route:</strong> ${med.route}</p>
                <p><strong>Onset:</strong> ${med.onset}</p>
            </div>
        `;

        if (med.precautions && med.precautions.length > 0) {
            detailHTML += `
                <div class="alert-box">
                    <strong>⚠️ Precautions</strong>
                    <ul style="margin-top: 10px;">
                        ${med.precautions.map(prec => `<li>${prec}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        medicationDetail.innerHTML = detailHTML;
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';

        // Focus management for accessibility
        closeModal.focus();
    }

    // Close modal
    function closeModalView() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        searchInput.focus();
    }

    // Handle outside click
    function handleOutsideClick(e) {
        if (e.target === modal) {
            closeModalView();
        }
    }

    // Handle keyboard shortcuts
    function handleKeyPress(e) {
        // Escape key closes modal
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeModalView();
        }

        // Ctrl/Cmd + K focuses search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
