function createLauncherController({ startServices, createWindow, stopServices = () => {} }) {
  let servicesPromise = null;

  async function getServices() {
    if (!servicesPromise) {
      servicesPromise = Promise.resolve()
        .then(startServices)
        .catch((error) => {
          servicesPromise = null;
          throw error;
        });
    }
    return servicesPromise;
  }

  return {
    async openWindow() {
      const services = await getServices();
      return createWindow(services.webUrl, services.apiBaseUrl);
    },
    stop() {
      stopServices();
      servicesPromise = null;
    },
  };
}

module.exports = { createLauncherController };
