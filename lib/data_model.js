// Data Model for Multi-Page Shop System
export class Site {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.pages = [];
        this.components = [];
        this.metadata = {};
    }
}

export class Page {
    constructor(id, title, path) {
        this.id = id;
        this.title = title;
        this.path = path;
        this.components = [];
        this.metadata = {};
    }
}

export class Component {
    constructor(id, type, content, styles) {
        this.id = id;
        this.type = type;
        this.content = content;
        this.styles = styles;
    }
}

export class SiteDataModel {
    constructor() {
        this.sites = [];
        this.pages = [];
        this.components = [];
    }

    createSite(name) {
        const site = new Site(this.generateId(), name);
        this.sites.push(site);
        return site;
    }

    createPage(title, path) {
        const page = new Page(this.generateId(), title, path);
        this.pages.push(page);
        return page;
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

export default SiteDataModel;