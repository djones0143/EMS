# Kentucky EMS Medication Reference

A mobile and desktop-friendly web application for Kentucky paramedics to quickly access medication references based on Kentucky statewide EMS protocols.

## Features

- **24 Common EMS Medications** - Comprehensive database of medications used in Kentucky EMS protocols
- **Quick Search** - Real-time search by medication name, generic name, or indication
- **Category Filtering** - Filter by medication categories (Cardiac, Respiratory, Analgesia, etc.)
- **Detailed Information** - Each medication includes:
  - Indications
  - Contraindications
  - Adult and pediatric dosing
  - Route and onset
  - Important precautions
- **Responsive Design** - Optimized for both mobile devices and desktop computers
- **Fast & Lightweight** - No frameworks required, works offline after initial load
- **Accessible** - Keyboard navigation support (Ctrl/Cmd + K for search, Escape to close modal)

## Medications Included

The app includes essential medications across multiple categories:

### Cardiac
- Epinephrine, Nitroglycerin, Aspirin, Adenosine, Amiodarone, Atropine, Calcium Chloride, Dopamine

### Respiratory
- Albuterol, Ipratropium Bromide

### Analgesia
- Fentanyl, Morphine Sulfate

### Sedation
- Midazolam (Versed), Ketamine

### Antidotes
- Naloxone (Narcan), Activated Charcoal

### GI/Antiemetic
- Ondansetron (Zofran)

### Other
- Dextrose, Diphenhydramine, Magnesium Sulfate, Sodium Bicarbonate, Glucagon, Normal Saline, Tranexamic Acid

## Usage

### Deployment

This is a static web application with no server requirements. To deploy:

1. **Local Development:**
   ```bash
   # Simply open index.html in your web browser
   open index.html
   ```

2. **Web Server:**
   Upload all files to any web server:
   - index.html
   - styles.css
   - app.js
   - medications.js

3. **GitHub Pages:**
   - Push to a GitHub repository
   - Enable GitHub Pages in repository settings
   - Access via `https://yourusername.github.io/repository-name`

4. **Other Hosting:**
   Works with any static hosting service:
   - Netlify
   - Vercel
   - AWS S3
   - Azure Static Web Apps
   - Firebase Hosting

### Features Guide

**Search:**
- Type in the search box to find medications by name, generic name, or indication
- Click the X button or clear the field to reset

**Filter:**
- Use the category dropdown to show only medications in a specific category

**View Details:**
- Click or tap any medication card to view complete information
- Press Escape or click outside the modal to close

**Keyboard Shortcuts:**
- `Ctrl/Cmd + K` - Focus search bar
- `Escape` - Close medication detail modal
- `Tab` - Navigate between medication cards

## Technical Details

### Technology Stack
- HTML5
- CSS3 (Grid, Flexbox, CSS Variables)
- Vanilla JavaScript (ES6+)
- No external dependencies

### Browser Support
- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

### File Structure
```
EMS/
├── index.html          # Main HTML structure
├── styles.css          # Responsive styling
├── app.js              # Application logic
├── medications.js      # Medication database
└── README.md           # Documentation
```

## Customization

### Adding New Medications

Edit `medications.js` and add a new medication object:

```javascript
{
    id: 25,
    name: "Medication Name",
    genericName: "generic name",
    category: "cardiac", // or respiratory, analgesia, sedation, antidotes, gi, other
    indications: ["Indication 1", "Indication 2"],
    contraindications: ["Contraindication 1"],
    dose: {
        adult: "Dosage information",
        pediatric: "Dosage information"
    },
    route: "IV, IM, PO",
    onset: "Time to onset",
    precautions: ["Precaution 1", "Precaution 2"]
}
```

### Modifying Styles

Edit `styles.css` to customize:
- Colors (CSS variables in `:root`)
- Layout and spacing
- Font sizes
- Mobile breakpoints

### Adding Categories

1. Add new option in `index.html` category filter
2. Update `getCategoryLabel()` function in `app.js`
3. Use the new category in medication objects

## Important Notes

⚠️ **For Emergency Use Only**

This application is designed as a quick reference tool for Kentucky EMS providers. It should:
- NOT replace official Kentucky statewide EMS protocols
- NOT replace medical direction when required
- NOT be used as the sole source for medication administration decisions
- Be used in conjunction with proper training and certification

Always follow:
1. Kentucky statewide EMS protocols
2. Local medical direction
3. Your service's standard operating procedures
4. Your scope of practice

## License

This project is intended for educational and reference purposes for Kentucky EMS providers.

## Updates

Last Updated: January 2026

For protocol updates, refer to the official Kentucky Board of Emergency Medical Services.

## Contributing

To update medication information:
1. Verify information against current Kentucky EMS protocols
2. Edit the appropriate entries in `medications.js`
3. Test thoroughly on mobile and desktop
4. Document changes

## Support

For issues or questions about:
- **Protocol accuracy**: Contact Kentucky Board of Emergency Medical Services
- **Technical issues**: Submit an issue in the repository
- **Feature requests**: Submit an issue with the "enhancement" label
