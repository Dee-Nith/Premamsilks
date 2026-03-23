/**
 * PREMAM SILKS - Main JavaScript
 * Handles hero carousel, mobile navigation, sticky header, and interactions
 */

document.addEventListener('DOMContentLoaded', function () {
  // ===== Header Scroll Effect =====
  const header = document.getElementById('header');

  function handleScroll() {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleScroll);
  handleScroll(); // Initial check

  // ===== Mobile Navigation =====
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileNav = document.getElementById('mobileNav');
  const mobileNavClose = document.getElementById('mobileNavClose');
  const mobileOverlay = document.getElementById('mobileOverlay');

  function openMobileNav() {
    mobileNav.classList.add('active');
    mobileOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileNav() {
    mobileNav.classList.remove('active');
    mobileOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', openMobileNav);
  }

  if (mobileNavClose) {
    mobileNavClose.addEventListener('click', closeMobileNav);
  }

  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', closeMobileNav);
  }

  // ===== Hero Slider =====
  const heroSlides = document.querySelectorAll('.hero-slide');
  const heroDots = document.querySelectorAll('.hero-dot');
  let currentSlide = 0;
  let slideInterval;

  function showSlide(index) {
    // Remove active class from all slides and dots
    heroSlides.forEach(slide => slide.classList.remove('active'));
    heroDots.forEach(dot => dot.classList.remove('active'));

    // Add active class to current slide and dot
    if (heroSlides[index]) {
      heroSlides[index].classList.add('active');
    }
    if (heroDots[index]) {
      heroDots[index].classList.add('active');
    }

    currentSlide = index;
  }

  function nextSlide() {
    let next = currentSlide + 1;
    if (next >= heroSlides.length) {
      next = 0;
    }
    showSlide(next);
  }

  function startSlider() {
    slideInterval = setInterval(nextSlide, 5000); // Change slide every 5 seconds
  }

  function stopSlider() {
    clearInterval(slideInterval);
  }

  // Dot click handlers
  heroDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      stopSlider();
      showSlide(index);
      startSlider();
    });
  });

  // Start the slider if slides exist
  if (heroSlides.length > 0) {
    startSlider();
  }

  // ===== Newsletter Form =====
  const newsletterForm = document.getElementById('newsletterForm');

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const emailInput = this.querySelector('input[type="email"]');
      const email = emailInput?.value;
      const submitBtn = this.querySelector('button[type="submit"]');

      if (!email) return;

      const functionsUrl = window.PremamDB?.CloudFunctions?.subscribeNewsletter;
      if (functionsUrl) {
        try {
          if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Subscribing...'; }
          const res = await fetch(functionsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const data = await res.json();
          if (window.PremamCart?.showToast) {
            PremamCart.showToast(data.message || 'Subscribed successfully!', 'success');
          }
        } catch (err) {
          if (window.PremamCart?.showToast) {
            PremamCart.showToast('Subscription failed. Please try again.', 'error');
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Subscribe'; }
        }
      } else {
        if (window.PremamCart?.showToast) {
          PremamCart.showToast('Thank you for subscribing!', 'success');
        }
      }
      this.reset();
    });
  }

  // ===== Contact Form =====
  const contactForm = document.getElementById('contactForm');

  if (contactForm) {
    contactForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const formData = new FormData(this);
      const firstName = formData.get('firstName') || '';
      const lastName = formData.get('lastName') || '';
      const data = {
        name: (firstName + ' ' + lastName).trim(),
        email: formData.get('email') || '',
        phone: formData.get('phone') || '',
        subject: formData.get('subject') || '',
        message: formData.get('message') || ''
      };

      if (!data.name || !data.email || !data.message) {
        if (window.PremamCart?.showToast) {
          PremamCart.showToast('Please fill in all required fields.', 'error');
        }
        return;
      }

      const submitBtn = this.querySelector('button[type="submit"]');
      const functionsUrl = window.PremamDB?.CloudFunctions?.submitContact;

      if (functionsUrl) {
        try {
          if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }
          const res = await fetch(functionsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          const result = await res.json();
          if (res.ok) {
            if (window.PremamCart?.showToast) {
              PremamCart.showToast('Message sent successfully! We\'ll get back to you soon.', 'success');
            }
            this.reset();
          } else {
            throw new Error(result.error || 'Failed to send message');
          }
        } catch (err) {
          if (window.PremamCart?.showToast) {
            PremamCart.showToast('Failed to send message. Please try WhatsApp instead.', 'error');
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Message'; }
        }
      } else {
        if (window.PremamCart?.showToast) {
          PremamCart.showToast('Message sent! We\'ll get back to you soon.', 'success');
        }
        this.reset();
      }
    });
  }

  // ===== Smooth Scroll for Anchor Links =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

        // Close mobile nav if open
        closeMobileNav();
      }
    });
  });

  // ===== Product Card Quick Actions =====
  const productCards = document.querySelectorAll('.product-card');

  productCards.forEach((card, index) => {
    // --- Wishlist button ---
    const wishlistBtn = card.querySelector('.product-action-btn[aria-label="Add to Wishlist"]');

    if (wishlistBtn) {
      wishlistBtn.addEventListener('click', function () {
        this.classList.toggle('active');

        // Toggle filled heart
        const svg = this.querySelector('svg');
        if (this.classList.contains('active')) {
          svg.setAttribute('fill', 'currentColor');
          updateWishlistCount(1);
        } else {
          svg.setAttribute('fill', 'none');
          updateWishlistCount(-1);
        }
      });
    }

    // --- Inject Add to Cart button ---
    const productInfo = card.querySelector('.product-info');
    if (productInfo && !productInfo.querySelector('.add-to-cart-btn')) {
      const addBtn = document.createElement('button');
      addBtn.className = 'add-to-cart-btn';
      addBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        Add to Cart
      `;
      productInfo.appendChild(addBtn);

      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Extract product data from the card
        const name = card.querySelector('.product-name')?.textContent?.trim() || 'Silk Saree';
        const priceText = card.querySelector('.product-price .current')?.textContent || '0';
        const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
        const category = card.querySelector('.product-category')?.textContent?.trim() || 'Saree';
        const image = card.querySelector('.main-image')?.src || '';
        const originalPriceText = card.querySelector('.product-price .original')?.textContent || '';
        const originalPrice = originalPriceText ? parseInt(originalPriceText.replace(/[^\d]/g, '')) : null;

        // Generate a unique ID from the product name
        const id = 'prod_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 40) + '_' + index;

        if (window.PremamCart) {
          PremamCart.add({
            id,
            name,
            price,
            originalPrice,
            image,
            category
          });

          // Visual feedback
          this.classList.add('added');
          this.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Added!
          `;

          // Reset after 2 seconds
          setTimeout(() => {
            this.classList.remove('added');
            this.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Add to Cart
            `;
          }, 2000);
        }
      });
    }
  });

  // ===== Wishlist & Cart Count =====
  let wishlistCount = 0;
  let cartCount = 0;

  function updateWishlistCount(change) {
    wishlistCount += change;
    if (wishlistCount < 0) wishlistCount = 0;

    const badges = document.querySelectorAll('.nav-icon[aria-label="Wishlist"] .badge');
    badges.forEach(badge => {
      badge.textContent = wishlistCount;
    });
  }

  function updateCartCount(change) {
    cartCount += change;
    if (cartCount < 0) cartCount = 0;

    const badges = document.querySelectorAll('.nav-icon[aria-label="Shopping Cart"] .badge');
    badges.forEach(badge => {
      badge.textContent = cartCount;
    });
  }

  // ===== Testimonials Rotation (if multiple) =====
  const testimonials = [
    {
      text: "The most beautiful Kanjivaram I've ever owned. The craftsmanship is impeccable and the colors are exactly as shown. Received so many compliments at my daughter's wedding!",
      author: "Priya Venkatesh",
      location: "Chennai, Tamil Nadu"
    },
    {
      text: "Premam Silks exceeded my expectations! The video call consultation helped me choose the perfect saree for my engagement. The delivery was prompt and packaging was exquisite.",
      author: "Ananya Sharma",
      location: "Mumbai, Maharashtra"
    },
    {
      text: "I've been buying from Premam Silks for years. Their collection is unmatched and the quality speaks for itself. A truly premium experience every single time.",
      author: "Lakshmi Iyer",
      location: "Coimbatore, Tamil Nadu"
    }
  ];

  let currentTestimonial = 0;
  const testimonialCard = document.getElementById('testimonialActive');

  function rotateTestimonial() {
    if (!testimonialCard) return;

    currentTestimonial = (currentTestimonial + 1) % testimonials.length;
    const t = testimonials[currentTestimonial];

    testimonialCard.style.opacity = '0';

    setTimeout(() => {
      const textEl = testimonialCard.querySelector('.testimonial-text');
      const authorEl = testimonialCard.querySelector('.testimonial-author h5');
      const locationEl = testimonialCard.querySelector('.testimonial-author span');

      if (textEl) textEl.textContent = '"' + t.text + '"';
      if (authorEl) authorEl.textContent = t.author;
      if (locationEl) locationEl.textContent = t.location;

      testimonialCard.style.opacity = '1';
    }, 300);
  }

  if (testimonialCard) {
    setInterval(rotateTestimonial, 6000);
    testimonialCard.style.transition = 'opacity 0.3s ease';
  }

  // ===== Animate on Scroll =====
  function animateOnScroll() {
    const elements = document.querySelectorAll('.collection-card, .product-card, .feature-card');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    elements.forEach((el, index) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = `all 0.6s ease ${index * 0.1}s`;
      observer.observe(el);
    });
  }

  animateOnScroll();

  // ===== WhatsApp Float Hover Effect =====
  const whatsappFloat = document.querySelector('.whatsapp-float');
  if (whatsappFloat) {
    whatsappFloat.addEventListener('mouseenter', function () {
      this.style.transform = 'scale(1.1)';
    });
    whatsappFloat.addEventListener('mouseleave', function () {
      this.style.transform = 'scale(1)';
    });
  }

  // ===== Search Modal =====
  const searchBtn = document.getElementById('searchBtn');
  const searchOverlay = document.getElementById('searchOverlay');
  const searchModal = document.getElementById('searchModal');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchClose = document.getElementById('searchClose');

  let cachedProducts = null;
  let searchTimeout = null;

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
  }

  function openSearch() {
    if (!searchOverlay || !searchModal) return;
    searchOverlay.classList.add('active');
    searchModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (searchResults) {
      searchResults.innerHTML = '<p class="search-hint">Search by product name, saree code, or category</p>';
    }
  }

  function closeSearch() {
    if (!searchOverlay || !searchModal) return;
    searchOverlay.classList.remove('active');
    searchModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  async function loadProducts() {
    if (cachedProducts) return cachedProducts;
    if (typeof getProducts === 'function') {
      cachedProducts = await getProducts();
      return cachedProducts;
    }
    return [];
  }

  function formatPrice(price) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);
  }

  async function handleSearch(query) {
    if (!searchResults) return;
    query = query.trim().toLowerCase();

    if (!query) {
      searchResults.innerHTML = '<p class="search-hint">Search by product name, saree code, or category</p>';
      return;
    }

    if (query.length < 2) return;

    searchResults.innerHTML = '<p class="search-hint">Searching...</p>';

    const products = await loadProducts();
    const matches = products.filter(p => {
      const name = (p.name || '').toLowerCase();
      const code = (p.sareeCode || '').toLowerCase();
      const category = (p.category || '').toLowerCase();
      const color = (p.color || '').toLowerCase();
      return name.includes(query) || code.includes(query) || category.includes(query) || color.includes(query);
    }).slice(0, 10);

    if (matches.length === 0) {
      searchResults.innerHTML = '<p class="search-no-results">No products found. Try a different search term.</p>';
      return;
    }

    searchResults.innerHTML = matches.map(p => {
      const img = (p.images && p.images[0]) || p.image || 'images/placeholder.png';
      return `<a href="product.html?id=${escapeHTML(p.id)}" class="search-result-item">
        <img src="${escapeHTML(img)}" alt="${escapeHTML(p.name)}" class="search-result-img" onerror="this.src='images/placeholder.png'">
        <div class="search-result-info">
          ${p.sareeCode ? `<span class="search-result-code">${escapeHTML(p.sareeCode)}</span>` : ''}
          <div class="search-result-name">${escapeHTML(p.name)}</div>
          <span class="search-result-price">${formatPrice(p.price)}</span>
        </div>
      </a>`;
    }).join('');
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', openSearch);
  }

  if (searchClose) {
    searchClose.addEventListener('click', closeSearch);
  }

  if (searchOverlay) {
    searchOverlay.addEventListener('click', closeSearch);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && searchModal && searchModal.classList.contains('active')) {
      closeSearch();
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => handleSearch(this.value), 300);
    });
  }

  // ===== Header Search Bar (desktop) =====
  const headerSearchInput = document.getElementById('headerSearchInput');
  if (headerSearchInput) {
    headerSearchInput.addEventListener('focus', function () {
      // On shop page, focus the shop search bar instead
      const shopInput = document.getElementById('shopSearchInput');
      if (shopInput) {
        this.blur();
        shopInput.focus();
        shopInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // On other pages, open the search modal
      openSearch();
      this.blur();
    });
    headerSearchInput.addEventListener('input', function () {
      const shopInput = document.getElementById('shopSearchInput');
      if (!shopInput) {
        openSearch();
        if (searchInput) {
          searchInput.value = this.value;
          handleSearch(this.value);
        }
        this.blur();
      }
    });
  }

  // ===== Shop Page Search Bar =====
  const shopSearchInput = document.getElementById('shopSearchInput');
  if (shopSearchInput) {
    let shopSearchTimeout = null;
    shopSearchInput.addEventListener('input', function () {
      clearTimeout(shopSearchTimeout);
      shopSearchTimeout = setTimeout(async () => {
        const query = this.value.trim().toLowerCase();
        const productsGrid = document.getElementById('productsGrid');
        if (!productsGrid) return;

        if (!query || query.length < 2) {
          // Reset: show all products by triggering existing filter system
          if (typeof applyFiltersAndSort === 'function') {
            applyFiltersAndSort();
          } else if (typeof window.shopSearch === 'function') {
            window.shopSearch('');
          } else {
            // Fallback: show all product cards
            productsGrid.querySelectorAll('.product-card').forEach(card => card.style.display = '');
          }
          return;
        }

        // Filter product cards directly on the page
        const cards = productsGrid.querySelectorAll('.product-card');
        let visibleCount = 0;
        cards.forEach(card => {
          const name = (card.querySelector('.product-name')?.textContent || '').toLowerCase();
          const code = (card.querySelector('.product-code')?.textContent || '').toLowerCase();
          const category = (card.querySelector('.product-category')?.textContent || '').toLowerCase();
          if (name.includes(query) || code.includes(query) || category.includes(query)) {
            card.style.display = '';
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });

        // Also search from Firestore for products not yet loaded
        if (visibleCount === 0) {
          const products = await loadProducts();
          const matches = products.filter(p => {
            const n = (p.name || '').toLowerCase();
            const c = (p.sareeCode || '').toLowerCase();
            const cat = (p.category || '').toLowerCase();
            const col = (p.color || '').toLowerCase();
            return n.includes(query) || c.includes(query) || cat.includes(query) || col.includes(query);
          });
          if (matches.length > 0) {
            // Redirect to search with results shown in modal
            openSearch();
            if (searchInput) {
              searchInput.value = this.value;
              handleSearch(this.value);
            }
          }
        }
      }, 300);
    });
  }

  // Premam Silks initialized
});
