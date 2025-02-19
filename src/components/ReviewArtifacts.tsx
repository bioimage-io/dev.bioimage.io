import React, { useState, useEffect } from 'react';
import { useHyphaStore } from '../store/hyphaStore';
import { Link, useNavigate } from 'react-router-dom';
import { RiLoginBoxLine } from 'react-icons/ri';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Dialog, Transition, Switch } from '@headlessui/react';
import { Fragment } from 'react';
import { ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { Menu } from '@headlessui/react';
import { resolveHyphaUrl } from '../utils/urlHelpers';
import { InformationCircleIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import StatusBadge from './StatusBadge';
import { Pagination } from './ArtifactGrid';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { IconButton, Tooltip } from '@mui/material';

interface Artifact {
  id: string;
  alias: string;
  manifest: any;
  type: string;
  created_by: string;
  versions: Array<{
    version: string;
    comment: string;
    created_at: number;
  }>;
  staging?: any[];
}

const ReviewArtifacts: React.FC = () => {
  const { 
    artifactManager, 
    user, 
    isLoggedIn,
    reviewArtifactsPage,
    reviewArtifactsTotalItems,
    setReviewArtifactsPage,
    setReviewArtifactsTotalItems,
    itemsPerPage 
  } = useHyphaStore();
  const navigate = useNavigate();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [artifactToDelete, setArtifactToDelete] = useState<Artifact | null>(null);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [showPendingOnly, setShowPendingOnly] = useState(true);
  const [copiedIds, setCopiedIds] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (isLoggedIn && user) {
      loadArtifacts();
    }
  }, [artifactManager, user, isLoggedIn, showPendingOnly, reviewArtifactsPage]);

  const loadArtifacts = async () => {
    if (!artifactManager) return;

    try {
      setLoading(true);
      const filters = {
        version: "stage",
      };
      if (showPendingOnly) {
        filters.manifest = { status: 'request-review' };
      }

      const response = await artifactManager.list({
        parent_id: "bioimage-io/bioimage.io",
        filters: filters,
        limit: itemsPerPage,
        offset: (reviewArtifactsPage - 1) * itemsPerPage,
        pagination: true,
        _rkwargs: true
      });

      setArtifacts(response.items);
      setReviewArtifactsTotalItems(response.total);
      setError(null);
    } catch (err) {
      console.error('Error loading artifacts:', err);
      setError('Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedArtifact || !artifactManager) return;

    try {
      setLoading(true);
      await artifactManager.approve({
        artifact_id: selectedArtifact.id,
        _rkwargs: true
      });
      
      await loadArtifacts();
      setIsApproveDialogOpen(false);
      setSelectedArtifact(null);
    } catch (err) {
      console.error('Error approving artifact:', err);
      setError('Failed to approve artifact');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedArtifact || !artifactManager) return;

    try {
      setLoading(true);
      await artifactManager.reject({
        artifact_id: selectedArtifact.id,
        reason: rejectReason,
        _rkwargs: true
      });
      
      await loadArtifacts();
      setIsRejectDialogOpen(false);
      setSelectedArtifact(null);
      setRejectReason('');
    } catch (err) {
      console.error('Error rejecting artifact:', err);
      setError('Failed to reject artifact');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteArtifact = async () => {
    if (!artifactToDelete || !artifactManager) return;

    try {
      setLoading(true);
      await artifactManager.delete({
        artifact_id: artifactToDelete.id,
        version:  artifactToDelete.versions && artifactToDelete.versions.length > 0 ? "stage" : null,
        delete_files: true,
        recursive: true,
        _rkwargs: true
      });
      
      await loadArtifacts();
      setIsDeleteDialogOpen(false);
      setArtifactToDelete(null);
    } catch (err) {
      console.error('Error deleting artifact:', err);
      setError('Failed to delete artifact');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (artifact: Artifact, newStatus: string) => {
    try {
      if (!artifact.manifest) return;
      
      let updatedManifest = { ...artifact.manifest };
      

      updatedManifest.status = newStatus;


      await artifactManager.edit({
        artifact_id: artifact.id,
        manifest: updatedManifest,
        version: "stage",
        _rkwargs: true
      });
      
      // Refresh the list
      loadArtifacts();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handlePageChange = (page: number) => {
    setReviewArtifactsPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculate number of pending review artifacts
  const pendingCount = artifacts.filter(a => a.manifest?.status === 'request-review').length;

  const handleCopyId = (artifactId: string) => {
    const id = artifactId.split('/').pop() || '';
    navigator.clipboard.writeText(id);
    setCopiedIds(prev => ({ ...prev, [artifactId]: true }));
    setTimeout(() => {
      setCopiedIds(prev => ({ ...prev, [artifactId]: false }));
    }, 2000);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="mb-4">
            <RiLoginBoxLine className="mx-auto h-12 w-12 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Admin Access Required
          </h2>
          <p className="text-gray-500 mb-4">
            Please login with admin credentials to review artifacts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              Review Staged Artifacts
            </h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Switch
                  checked={showPendingOnly}
                  onChange={(checked) => {
                    setShowPendingOnly(checked);
                    setReviewArtifactsPage(1);
                  }}
                  className={`${
                    showPendingOnly ? 'bg-blue-600' : 'bg-gray-200'
                  } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                >
                  <span className="sr-only">Show pending review artifacts only</span>
                  <span
                    className={`${
                      showPendingOnly ? 'translate-x-6' : 'translate-x-1'
                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                  />
                </Switch>
                <span className="ml-2 text-sm text-gray-600">
                  {showPendingOnly ? 'Pending Review' : 'All Artifacts'}
                </span>
              </div>
              <button
                onClick={loadArtifacts}
                disabled={loading}
                className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ArrowPathIcon 
                  className={`-ml-0.5 mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} 
                />
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Info Box with Collapsible Guidelines */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <InformationCircleIcon className="h-5 w-5 text-blue-400" aria-hidden="true" />
              </div>
              <div className="ml-3 w-full">
                <h3 className="text-sm font-medium text-blue-800">
                  Privileged Reviewer Access
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                {pendingCount > 0 && <p className="mt-1">You have {pendingCount} item{pendingCount !== 1 ? 's' : ''} waiting for review.</p>}
                  <p className="mt-1">As a privileged reviewer, your role is crucial in maintaining the quality and reliability of the BioImage Model Zoo. Please review each submission carefully according to our guidelines.</p>
                </div>

                {/* Collapsible Guidelines Section */}
                <div className="mt-4 border-t border-blue-200 pt-4">
                  <button
                    className="w-full flex justify-between items-center text-left text-sm font-medium text-blue-800"
                    onClick={() => setIsGuidelinesOpen(!isGuidelinesOpen)}
                  >
                    <span>Review Guidelines</span>
                    {isGuidelinesOpen ? (
                      <ChevronUpIcon className="h-5 w-5 text-blue-500" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-blue-500" />
                    )}
                  </button>
                  
                  <Transition
                    show={isGuidelinesOpen}
                    enter="transition-all ease-in-out duration-300"
                    enterFrom="max-h-0 opacity-0"
                    enterTo="max-h-[800px] opacity-100"
                    leave="transition-all ease-in-out duration-200"
                    leaveFrom="max-h-[800px] opacity-100"
                    leaveTo="max-h-0 opacity-0"
                    className="overflow-hidden"
                  >
                    <div className="mt-4 text-sm text-blue-700">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-blue-800">1. Basic Information Completeness</h4>
                          <ul className="mt-1 list-disc list-inside space-y-1">
                            <li>Name is descriptive and follows convention (e.g., "3D UNet Arabidopsis Apical Stem Cells")</li>
                            <li>Authors and maintainers are properly listed with contact information</li>
                            <li>License is specified (e.g., MIT, Apache)</li>
                            <li>Proper citation information is included with DOI/URL</li>
                            <li>Tags are relevant and help in model discovery (e.g., "3d", "unet", "semantic-segmentation")</li>
                          </ul>
                        </div>
                        
                        <div>
                          <h4 className="font-medium text-blue-800">2. Documentation Quality</h4>
                          <ul className="mt-1 list-disc list-inside space-y-1">
                            <li>Description clearly explains:
                              <ul className="ml-6 list-circle">
                                <li>Model's purpose and use case</li>
                                <li>Input data requirements (e.g., "confocal images of Arabidopsis thaliana")</li>
                                <li>Expected results and output format</li>
                              </ul>
                            </li>
                            <li>Documentation includes:
                              <ul className="ml-6 list-circle">
                                <li>Step-by-step usage instructions</li>
                                <li>Input data specifications (e.g., voxel size, dimensions)</li>
                                <li>Example workflow or notebook</li>
                              </ul>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium text-blue-800">3. Technical Requirements</h4>
                          <ul className="mt-1 list-disc list-inside space-y-1">
                            <li>Input/Output specifications are complete:
                              <ul className="ml-6 list-circle">
                                <li>Correct axes information (e.g., "bczyx")</li>
                                <li>Data types and ranges</li>
                                <li>Shape requirements</li>
                              </ul>
                            </li>
                            <li>Sample data is provided:
                              <ul className="ml-6 list-circle">
                                <li>Test inputs and outputs</li>
                                <li>Sample images for verification</li>
                                <li>Cover images showing input/output examples</li>
                              </ul>
                            </li>
                            <li>Model weights and architecture are properly specified</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium text-blue-800">4. Visual Presentation</h4>
                          <ul className="mt-1 list-disc list-inside space-y-1">
                            <li>Cover images:
                              <ul className="ml-6 list-circle">
                                <li>Show clear input/output examples</li>
                                <li>Are of good quality and representative</li>
                                <li>Include scale bars where applicable</li>
                              </ul>
                            </li>
                            <li>Icons and badges are appropriate and informative</li>
                            <li>Visual documentation helps understand the model's function</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium text-blue-800">5. Ethical & Scientific Standards</h4>
                          <ul className="mt-1 list-disc list-inside space-y-1">
                            <li>Training data is properly cited and credited</li>
                            <li>Model limitations and assumptions are clearly stated</li>
                            <li>Performance metrics and validation methods are documented</li>
                            <li>Potential biases or limitations are disclosed</li>
                            <li>Compliance with data privacy and sharing guidelines</li>
                          </ul>
                        </div>

                        <div className="bg-blue-100 p-3 rounded-md mt-4">
                          <h4 className="font-medium text-blue-800">Review Checklist</h4>
                          <p className="text-blue-700 text-sm mt-1">Before approving, ensure:</p>
                          <ul className="mt-2 space-y-1 text-blue-700 text-sm">
                            <li>✓ All required fields in RDF are completed</li>
                            <li>✓ Documentation is clear for non-expert users</li>
                            <li>✓ Sample data works as expected</li>
                            <li>✓ Visual materials are informative</li>
                            <li>✓ Scientific citations are proper</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <div className="text-xl font-semibold text-gray-700">Loading artifacts...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500">{error}</div>
          </div>
        ) : artifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <CheckCircleIcon className="h-12 w-12 text-green-500 mb-4" />
            <p>No artifacts waiting for review</p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul role="list" className="divide-y divide-gray-200">
              {artifacts.map((artifact) => (
                <li key={artifact.id}>
                  <div className="px-4 py-4 sm:px-6 min-h-[300px]">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {artifact.manifest?.id_emoji && (
                                <span className="text-xl">{artifact.manifest.id_emoji}</span>
                              )}
                              <h3 className="text-lg font-medium text-gray-900 truncate">
                                {artifact.manifest?.name || artifact.alias}
                              </h3>
                            </div>

                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <div className="flex items-center gap-1 bg-gray-50 rounded-md px-2 py-1">
                                <span className="font-medium">ID:</span>
                                <code className="font-mono">{artifact.id.split('/').pop()}</code>
                                <Tooltip title="Copy ID" placement="top">
                                  <IconButton
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyId(artifact.id);
                                    }}
                                    size="small"
                                    className="ml-1 text-gray-400 hover:text-gray-600"
                                    sx={{ padding: '2px' }}
                                  >
                                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                                {copiedIds[artifact.id] && (
                                  <span className="text-green-600 ml-1">Copied!</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge status={artifact.manifest?.status} size="small" />
                          </div>
                        <p className="mt-1 text-sm text-gray-500">
                          Submitted by: {artifact.created_by}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {artifact.manifest?.description || 'No description'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {artifact.manifest?.tags?.map((tag: string) => (
                            <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {tag}
                            </span>
                          ))}
                        </div>
                        
                        {artifact.manifest?.covers && artifact.manifest.covers.length > 0 && (
                          <div className="mt-3 flex gap-2 overflow-x-auto">
                            {artifact.manifest.covers.slice(0, 3).map((cover: string, index: number) => (
                              <div 
                                key={index}
                                className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-200"
                              >
                                <img
                                  src={resolveHyphaUrl(cover, artifact.id)}
                                  alt={`Cover ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => navigate(`/edit/${encodeURIComponent(artifact.id)}?tab=review`)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Review
                        </button>
                        
                        <Menu as="div" className="relative">
                          <Menu.Button className="inline-flex items-center p-2 border border-gray-300 rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            <EllipsisVerticalIcon className="h-5 w-5" />
                          </Menu.Button>
                          <Transition
                            as={Fragment}
                            enter="transition ease-out duration-100"
                            enterFrom="transform opacity-0 scale-95"
                            enterTo="transform opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="transform opacity-100 scale-100"
                            leaveTo="transform opacity-0 scale-95"
                          >
                            <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => handleStatusChange(artifact, 'in-review')}
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                                  >
                                    Mark as In Review
                                  </button>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => handleStatusChange(artifact, 'revision')}
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                                  >
                                    Request Revision
                                  </button>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => handleStatusChange(artifact, 'accepted')}
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                                  >
                                    Accept
                                  </button>
                                )}
                              </Menu.Item>
                              <div className="border-t border-gray-100" />
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => {
                                      setArtifactToDelete(artifact);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                    className={`${
                                      active ? 'bg-gray-100' : ''
                                    } flex w-full items-center px-4 py-2 text-sm text-red-600`}
                                  >
                                    Delete
                                  </button>
                                )}
                              </Menu.Item>
                            </Menu.Items>
                          </Transition>
                        </Menu>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Transition.Root show={isApproveDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={setIsApproveDialogOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                    <CheckCircleIcon className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                      Approve Artifact
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to approve this artifact? This will publish the staged version.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 sm:ml-3 sm:w-auto"
                    onClick={handleApprove}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={() => setIsApproveDialogOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Reject Dialog */}
      <Transition.Root show={isRejectDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={setIsRejectDialogOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                      Reject Artifact
                    </Dialog.Title>
                    <div className="mt-2">
                      <textarea
                        rows={4}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                        placeholder="Please provide a reason for rejection..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                    onClick={handleReject}
                    disabled={!rejectReason.trim()}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={() => {
                      setIsRejectDialogOpen(false);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Delete Confirmation Dialog */}
      <Transition.Root show={isDeleteDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={setIsDeleteDialogOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                      Delete Staged Version
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to delete this staged version? This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                    onClick={handleDeleteArtifact}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={() => {
                      setIsDeleteDialogOpen(false);
                      setArtifactToDelete(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {artifacts.length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={reviewArtifactsPage}
            totalPages={Math.ceil(reviewArtifactsTotalItems / itemsPerPage)}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
};

export default ReviewArtifacts; 