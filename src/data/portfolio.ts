export interface ExperienceEntry {
  role: string;   roleFr?: string;
  where: string;
  when: string;
  desc: string;   descFr?: string;
}

export interface EducationEntry {
  role: string;   roleFr?: string;
  where: string;
  when: string;
  desc: string;   descFr?: string;
  map: { name: string; lat: number; lng: number; zoom: number };
}

export interface ProjectEntry {
  title: string;
  desc: string;   descFr?: string;
  stack: string[];
  link?: string;
}

export interface Portfolio {
  name: string;
  tagline: string;  taglineFr?: string;
  about: { intro: string; introFr?: string; skills: string[] };
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  contact: {
    email: string;
    phone: string;
    github: string;
    linkedin: string;
    location: { name: string; lat: number; lng: number; zoom: number };
  };
}

export const PORTFOLIO: Portfolio = {
  name: 'Your Name',
  tagline:   'Full-Stack Developer',
  taglineFr: 'Développeur Full-Stack',
  about: {
    intro:
      "I'm a full-stack developer with a passion for building products that are fast, scalable, and enjoyable to use. From REST APIs to immersive 3D interfaces — I ship end-to-end.",
    introFr:
      "Je suis développeur full-stack passionné par la création de produits rapides, évolutifs et agréables à utiliser. Des API REST aux interfaces 3D immersives — je livre de bout en bout.",
    skills: [
      'JavaScript', 'TypeScript', 'Node.js', 'Express', 'React', 'Three.js',
      'MongoDB', 'PostgreSQL', 'Docker', 'AWS', 'Git', 'REST/GraphQL',
    ],
  },
  experience: [
    {
      role:   'Lead Full-Stack Developer',
      roleFr: 'Développeur Full-Stack Lead',
      where: 'Company A',
      when: '2022 — Present',
      desc:   'Architecting and shipping core product features for a B2B SaaS platform. Leading a cross-functional team, owning the API layer, and driving frontend performance from design to deployment.',
      descFr: "Conception et livraison des fonctionnalités clés d'une plateforme SaaS B2B. Direction d'une équipe pluridisciplinaire, ownership de la couche API et pilotage des performances frontend du design au déploiement.",
    },
    {
      role:   'Full-Stack Developer',
      roleFr: 'Développeur Full-Stack',
      where: 'Company B',
      when: '2020 — 2022',
      desc:   'Built data-heavy dashboards and UIs for enterprise clients using React and Node.js. Improved report generation pipeline, cutting processing time by 45%.',
      descFr: "Création de tableaux de bord et d'interfaces riches en données pour des clients enterprise avec React et Node.js. Amélioration du pipeline de génération de rapports, réduisant le temps de traitement de 45%.",
    },
    {
      role:   'Frontend Developer',
      roleFr: 'Développeur Frontend',
      where: 'Company C',
      when: '2018 — 2020',
      desc:   'Developed responsive web applications for clients. Maintained a React component library and introduced TypeScript across the frontend codebase.',
      descFr: "Développement d'applications web responsives pour des clients. Maintenance d'une bibliothèque de composants React et introduction de TypeScript dans le codebase frontend.",
    },
  ],
  education: [
    {
      role:   'M.Sc. Computer Science',
      roleFr: 'Master en Informatique',
      where: 'University A',
      when: '2016 — 2018',
      desc:   'Specialization in software engineering and distributed systems. Final-year project on real-time collaborative web applications.',
      descFr: "Spécialisation en génie logiciel et systèmes distribués. Projet de fin d'études sur les applications web collaboratives en temps réel.",
      map: { name: 'University A', lat: 48.8566, lng: 2.3522, zoom: 14 },
    },
    {
      role:   'B.Sc. Software Engineering',
      roleFr: 'Licence en Génie Logiciel',
      where: 'University B',
      when: '2013 — 2016',
      desc:   'Core curriculum in algorithms, databases, and software architecture. Graduated with honours.',
      descFr: "Cursus principal en algorithmes, bases de données et architecture logicielle. Diplômé avec mention.",
      map: { name: 'University B', lat: 48.8566, lng: 2.3522, zoom: 14 },
    },
  ],
  projects: [
    {
      title: 'DEV.ARENA',
      desc:   'This portfolio — a cyberpunk FPS built with Three.js and React. Shoot the monoliths to explore my career.',
      descFr: 'Ce portfolio — un FPS cyberpunk construit avec Three.js et React. Tirez sur les monolithes pour explorer ma carrière.',
      stack: ['Three.js', 'React', 'TypeScript', 'Zustand'],
      link: '',
    },
    {
      title: 'Project Alpha',
      desc:   'A B2B SaaS platform — core contributor to a compliance and data-governance product used by enterprise clients.',
      descFr: "Plateforme SaaS B2B — contributeur principal à un outil de conformité et gouvernance des données utilisé par des clients enterprise.",
      stack: ['Node.js', 'React', 'PostgreSQL', 'Docker'],
      link: '',
    },
    {
      title: 'Project Beta',
      desc:   'Internal tool for generating regulatory reports. Reduced generation time by 45% through async processing and smart caching.',
      descFr: "Outil interne pour générer des rapports réglementaires. Réduction du temps de génération de 45% via traitement asynchrone et mise en cache intelligente.",
      stack: ['Node.js', 'Bull', 'Redis', 'React'],
    },
  ],
  contact: {
    email: 'your.email@example.com',
    phone: '+00 000 000 000',
    github: 'github.com/your-username',
    linkedin: 'linkedin.com/in/your-username',
    location: { name: 'Your City, Country', lat: 48.8566, lng: 2.3522, zoom: 12 },
  },
};

export const STATIONS = [
  { id: 'about',      title: 'ABOUT',      color: 0x00ffd5, position: [0,   0, -28] as [number, number, number] },
  { id: 'experience', title: 'EXPERIENCE', color: 0xff2bd6, position: [28,  0,   0] as [number, number, number] },
  { id: 'education',  title: 'EDUCATION',  color: 0xfff200, position: [0,   0,  28] as [number, number, number] },
  { id: 'contact',    title: 'CONTACT',    color: 0x7b2cff, position: [-28, 0,   0] as [number, number, number] },
  { id: 'location',   title: 'LOCATION',   color: 0x7CFFCB, position: [28,  0, -28] as [number, number, number] },
  { id: 'projects',   title: 'PROJECTS',   color: 0xff6600, position: [-28, 0, -28] as [number, number, number] },
] as const;

export type StationId = (typeof STATIONS)[number]['id'];
