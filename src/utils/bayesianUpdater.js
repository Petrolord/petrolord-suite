// Basic Bayesian Updating Logic for parameter estimation given new data point

export const updatePosterior = (priorMean, priorStd, likelihoodMean, likelihoodStd) => {
    // For conjugate normal-normal distributions
    // 1/sigma_post^2 = 1/sigma_prior^2 + 1/sigma_likelihood^2
    // mu_post = sigma_post^2 * (mu_prior/sigma_prior^2 + mu_like/sigma_like^2)
    
    const precPrior = 1 / (priorStd * priorStd);
    const precLike = 1 / (likelihoodStd * likelihoodStd);
    const precPost = precPrior + precLike;
    
    const varPost = 1 / precPost;
    const stdPost = Math.sqrt(varPost);
    
    const meanPost = varPost * (priorMean * precPrior + likelihoodMean * precLike);
    
    return { mean: meanPost, stdDev: stdPost };
};