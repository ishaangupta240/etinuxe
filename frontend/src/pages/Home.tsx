import "./Home.css";

// Ideally this would be in a shared types file
type Role = "guest" | "human" | "admin";

type AdminSession = {
  id: string;
  email: string;
  name: string;
};

type AuthState =
  | { role: "guest" }
  | { role: "human"; userId: string; email: string; name: string }
  | { role: "admin"; admin: AdminSession };

interface HomeProps {
  onNavigate: (path: string) => void;
  auth: AuthState;
}

export default function Home({ onNavigate, auth }: HomeProps): JSX.Element {
  const serviceFeatures = [
    {
      icon: "🔬",
      title: "Advanced Miniaturization",
      description: "State-of-the-art size reduction technology with complete biological preservation."
    },
    {
      icon: "🛡️",
      title: "Comprehensive Insurance",
      description: "Full coverage for all aspects of your miniaturized lifestyle and transformation."
    },
    {
      icon: "⚡",
      title: "Rapid Process",
      description: "Streamlined procedures from consultation to completion in record time."
    },
    {
      icon: "💎",
      title: "Premium Support",
      description: "24/7 dedicated assistance for all your miniaturization needs."
    }
  ];

  const processSteps = [
    {
      step: "01",
      title: "Consultation & Assessment",
      description: "Comprehensive evaluation to determine your suitability for miniaturization."
    },
    {
      step: "02",
      title: "Insurance Planning",
      description: "Custom insurance package tailored to your specific needs and lifestyle."
    },
    {
      step: "03",
      title: "Transformation Process",
      description: "Safe, controlled miniaturization with continuous monitoring and support."
    },
    {
      step: "04",
      title: "Post-Service Care",
      description: "Ongoing assistance and insurance coverage for your new lifestyle."
    }
  ];

  const insurancePlans = [
    {
      name: "Basic",
      price: "$20 per 0.01× / month",
      features: [
        "Basic health protection",
        "Property adaptation",
        "Emergency response",
        "Standard support"
      ]
    },
    {
      name: "Plus",
      price: "$30 per 0.01× / month",
      features: [
        "Enhanced health coverage",
        "Full property adaptation",
        "Priority response",
        "Dedicated support"
      ],
      featured: true
    },
    {
      name: "Premium",
      price: "$60 per 0.01× / month",
      features: [
        "Comprehensive health coverage",
        "Premium property solutions",
        "24/7 priority response",
        "Dedicated support team",
        "Lifestyle enhancement"
      ]
    },
    {
      name: "Ultra",
      price: "$80 per 0.01× / month",
      features: [
        "Total health & wellness",
        "Concierge property services",
        "Instant emergency response",
        "Personal care coordinator",
        "Advanced lifestyle benefits",
        "Custom coverage options"
      ]
    }
  ];

  const scrollToInsurance = () => {
    if (typeof window === "undefined") {
      onNavigate("/signup");
      return;
    }
    const section = window.document.getElementById("home-insurance");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      onNavigate("/signup");
    }
  };

  return (
    <div className="home">
      <section className="home__hero">
        <div className="home__hero-content">
          <span className="home__badge">Transforming Human Potential</span>
          <h1 className="home__hero-title">
            Redefine Your World with <span className="home__hero-accent">Secure Miniaturization</span>
          </h1>
          <p className="home__hero-description">
            EtinuxE pioneers safe human miniaturization technology backed by comprehensive insurance protection. 
            Experience life from a new perspective with complete peace of mind.
          </p>
          <div className="home__hero-actions">
            {auth.role === 'guest' ? (
              <button 
                className="home__cta-primary" 
                onClick={() => onNavigate("/signup")}
              >
                Begin Your Journey
              </button>
            ) : (
              <button 
                className="home__cta-primary" 
                onClick={() => onNavigate("/account")}
              >
                Go to Your Account
              </button>
            )}
            <button 
              className="home__cta-secondary"
              onClick={scrollToInsurance}
            >
              View Insurance Plans
            </button>
          </div>
        </div>
        <div className="home__hero-visual">
          <div className="home__visual-container">
            <div className="home__visual-orb"></div>
            <div className="home__visual-ring"></div>
            <div className="home__visual-ring"></div>
            <div className="home__visual-ring"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="home__features">
        <div className="home__section-header">
          <h2>Why Choose EtinuxE?</h2>
          <p>Industry-leading technology and protection for your transformation journey</p>
        </div>
        <div className="home__features-grid">
          {serviceFeatures.map((feature, index) => (
            <div key={index} className="home__feature-card">
              <div className="home__feature-icon-wrapper">
                <span className="home__feature-icon">{feature.icon}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home__process">
        <div className="home__section-header">
          <h2>The Transformation Journey</h2>
          <p>Four simple steps to your new miniaturized life with complete protection</p>
        </div>
        <div className="home__process-steps">
          {processSteps.map((step, index) => (
            <div key={index} className="home__process-step">
              <div className="home__step-number">{step.step}</div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home__insurance" id="home-insurance">
        <div className="home__section-header">
          <h2>Comprehensive Protection Plans</h2>
          <p>Choose the coverage that fits your miniaturization needs and lifestyle</p>
        </div>
        <div className="home__insurance-plans">
          {insurancePlans.map((plan, index) => (
            <div 
              key={index} 
              className={`home__insurance-card ${plan.featured ? 'home__insurance-card--featured' : ''}`}
            >
              {plan.featured && <div className="home__featured-badge">Most Popular</div>}
              <h3>{plan.name}</h3>
              <div className="home__plan-price">{plan.price}</div>
              <ul className="home__plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
              <button
                className="home__plan-cta"
                onClick={() => onNavigate(auth.role === 'guest' ? "/signup" : "/account/insurance")}
              >
                Get Started
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="home__final-cta">
        <div className="home__cta-content">
          <h2>Ready to Begin Your Transformation?</h2>
          <p>Join thousands who have safely miniaturized with EtinuxE's protection</p>
          <button
            className="home__cta-primary home__cta-large"
            onClick={() => onNavigate(auth.role === 'guest' ? "/signup" : "/account/health")}
          >
            {auth.role === 'guest' ? 'Start Your Application' : 'Health Profile'}
          </button>
        </div>
      </section>
    </div>
  );
}