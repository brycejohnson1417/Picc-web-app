'use client';

import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  TerritoryBoundaryListResponse,
  TerritoryMarkerListResponse,
} from '@/lib/territory/types';
import type {
  TerritoryBoundaryEditorState,
  TerritoryMarkerEditorState,
} from '@/components/mobile/territory-boundary-sheet';

const BOUNDARY_VISIBILITY_STORAGE_KEY = 'territory-boundary-visibility-v1';

interface UseTerritoryOverlaysInput {
  boundaries: TerritoryBoundaryListResponse['boundaries'];
  markers: TerritoryMarkerListResponse['markers'];
  boundariesLoading: boolean;
  queryClient: QueryClient;
  onShowMap: () => void;
  onCenterLocation: (location: { lat: number; lng: number }) => void;
}

export function useTerritoryOverlays({
  boundaries,
  markers,
  boundariesLoading,
  queryClient,
  onShowMap,
  onCenterLocation,
}: UseTerritoryOverlaysInput) {
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [hiddenBoundaryIds, setHiddenBoundaryIds] = useState<string[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);
  const [hiddenMarkerIds, setHiddenMarkerIds] = useState<string[]>([]);
  const [showBoundarySheet, setShowBoundarySheet] = useState(false);
  const [boundaryPrefsReady, setBoundaryPrefsReady] = useState(false);
  const [boundaryEditor, setBoundaryEditor] = useState<TerritoryBoundaryEditorState | null>(null);
  const [drawingBoundaryMode, setDrawingBoundaryMode] = useState(false);
  const [savingBoundary, setSavingBoundary] = useState(false);
  const [markerEditor, setMarkerEditor] = useState<TerritoryMarkerEditorState | null>(null);
  const [savingMarker, setSavingMarker] = useState(false);
  const [searchingMarkerAddress, setSearchingMarkerAddress] = useState(false);

  useEffect(() => {
    if (boundaryPrefsReady || boundariesLoading) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(BOUNDARY_VISIBILITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          hiddenBoundaryIds?: string[];
          hiddenMarkerIds?: string[];
          showBoundaries?: boolean;
          showMarkers?: boolean;
        };
        setShowBoundaries(parsed.showBoundaries !== false);
        setHiddenBoundaryIds(
          [
            ...(Array.isArray(parsed.hiddenBoundaryIds)
              ? parsed.hiddenBoundaryIds.filter((value): value is string => typeof value === 'string')
              : []),
            ...boundaries.filter((boundary) => !boundary.isVisibleByDefault).map((boundary) => boundary.id),
          ].filter((value, index, array) => array.indexOf(value) === index),
        );
        setShowMarkers(parsed.showMarkers !== false);
        setHiddenMarkerIds(
          [
            ...(Array.isArray(parsed.hiddenMarkerIds)
              ? parsed.hiddenMarkerIds.filter((value): value is string => typeof value === 'string')
              : []),
            ...markers.filter((marker) => !marker.isVisibleByDefault).map((marker) => marker.id),
          ].filter((value, index, array) => array.indexOf(value) === index),
        );
      } else {
        setShowBoundaries(true);
        setHiddenBoundaryIds(boundaries.filter((boundary) => !boundary.isVisibleByDefault).map((boundary) => boundary.id));
        setShowMarkers(true);
        setHiddenMarkerIds(markers.filter((marker) => !marker.isVisibleByDefault).map((marker) => marker.id));
      }
    } catch {
      setShowBoundaries(true);
      setHiddenBoundaryIds(boundaries.filter((boundary) => !boundary.isVisibleByDefault).map((boundary) => boundary.id));
      setShowMarkers(true);
      setHiddenMarkerIds(markers.filter((marker) => !marker.isVisibleByDefault).map((marker) => marker.id));
    } finally {
      setBoundaryPrefsReady(true);
    }
  }, [boundaries, boundariesLoading, boundaryPrefsReady, markers]);

  useEffect(() => {
    if (!boundaryPrefsReady) {
      return;
    }

    window.localStorage.setItem(
      BOUNDARY_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        showBoundaries,
        hiddenBoundaryIds,
        showMarkers,
        hiddenMarkerIds,
      }),
    );
  }, [boundaryPrefsReady, hiddenBoundaryIds, hiddenMarkerIds, showBoundaries, showMarkers]);

  useEffect(() => {
    if (boundaries.length === 0) {
      return;
    }
    setHiddenBoundaryIds((current) => {
      const knownIds = current.filter((boundaryId) => boundaries.some((boundary) => boundary.id === boundaryId));
      const hiddenByDefault = boundaries.filter((boundary) => !boundary.isVisibleByDefault).map((boundary) => boundary.id);
      return [...knownIds, ...hiddenByDefault].filter((value, index, array) => array.indexOf(value) === index);
    });
  }, [boundaries]);

  useEffect(() => {
    if (markers.length === 0) {
      return;
    }
    setHiddenMarkerIds((current) => {
      const knownIds = current.filter((markerId) => markers.some((marker) => marker.id === markerId));
      const hiddenByDefault = markers.filter((marker) => !marker.isVisibleByDefault).map((marker) => marker.id);
      return [...knownIds, ...hiddenByDefault].filter((value, index, array) => array.indexOf(value) === index);
    });
  }, [markers]);

  function toggleBoundaryVisibility(boundaryId: string) {
    setHiddenBoundaryIds((current) => (current.includes(boundaryId) ? current.filter((value) => value !== boundaryId) : [...current, boundaryId]));
  }

  function toggleAllBoundaries() {
    setShowBoundaries((current) => !current);
  }

  function toggleMarkerVisibility(markerId: string) {
    setHiddenMarkerIds((current) => (current.includes(markerId) ? current.filter((value) => value !== markerId) : [...current, markerId]));
  }

  function toggleAllMarkers() {
    setShowMarkers((current) => !current);
  }

  function closeBoundaryEditor() {
    setBoundaryEditor(null);
    setDrawingBoundaryMode(false);
  }

  function closeMarkerEditor() {
    setMarkerEditor(null);
  }

  function startCreatingBoundary() {
    setShowBoundarySheet(false);
    setBoundaryEditor({
      id: null,
      name: '',
      description: '',
      color: '#ef4444',
      borderWidth: 2,
      coordinates: [],
    });
    setDrawingBoundaryMode(true);
    onShowMap();
  }

  function startEditingBoundary(boundary: TerritoryBoundaryListResponse['boundaries'][number]) {
    setShowBoundarySheet(false);
    setBoundaryEditor({
      id: boundary.id,
      name: boundary.name,
      description: boundary.description ?? '',
      color: boundary.color,
      borderWidth: boundary.borderWidth,
      coordinates: boundary.coordinates,
    });
    setDrawingBoundaryMode(false);
    onShowMap();
  }

  function startCreatingMarker() {
    setShowBoundarySheet(false);
    setMarkerEditor({
      id: null,
      name: '',
      description: '',
      address: '',
      lat: null,
      lng: null,
      color: '#0f172a',
    });
    onShowMap();
  }

  function startEditingMarker(marker: TerritoryMarkerListResponse['markers'][number]) {
    setShowBoundarySheet(false);
    setMarkerEditor({
      id: marker.id,
      name: marker.name,
      description: marker.description ?? '',
      address: marker.address ?? '',
      lat: marker.lat,
      lng: marker.lng,
      color: marker.color,
    });
    onShowMap();
  }

  async function deleteBoundary(boundary: TerritoryBoundaryListResponse['boundaries'][number]) {
    if (!window.confirm(`Delete the "${boundary.name}" territory boundary?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/territory/boundaries/${boundary.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Unable to delete territory boundary');
      }

      setHiddenBoundaryIds((current) => current.filter((value) => value !== boundary.id));
      await queryClient.invalidateQueries({ queryKey: ['territory-boundaries'] });
      toast.success('Territory boundary deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete territory boundary');
    }
  }

  async function deleteMarker(marker: TerritoryMarkerListResponse['markers'][number]) {
    if (!window.confirm(`Delete the "${marker.name}" home marker?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/territory/markers/${marker.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Unable to delete home marker');
      }

      setHiddenMarkerIds((current) => current.filter((value) => value !== marker.id));
      await queryClient.invalidateQueries({ queryKey: ['territory-markers'] });
      toast.success('Home marker deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete home marker');
    }
  }

  async function saveBoundary() {
    if (!boundaryEditor) {
      return;
    }

    if (!boundaryEditor.name.trim()) {
      toast.error('Boundary name is required.');
      return;
    }

    if (boundaryEditor.coordinates.length < 3) {
      toast.error('Add at least 3 points to save a territory.');
      return;
    }

    setSavingBoundary(true);
    try {
      const response = await fetch(
        boundaryEditor.id ? `/api/territory/boundaries/${boundaryEditor.id}` : '/api/territory/boundaries',
        {
          method: boundaryEditor.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: boundaryEditor.name,
            description: boundaryEditor.description || null,
            color: boundaryEditor.color,
            borderWidth: boundaryEditor.borderWidth,
            coordinates: boundaryEditor.coordinates,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to save territory boundary');
      }

      closeBoundaryEditor();
      setShowBoundaries(true);
      await queryClient.invalidateQueries({ queryKey: ['territory-boundaries'] });
      toast.success(boundaryEditor.id ? 'Territory boundary updated' : 'Territory boundary saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save territory boundary');
    } finally {
      setSavingBoundary(false);
    }
  }

  async function searchMarkerAddress() {
    if (!markerEditor?.address.trim()) {
      toast.error('Enter an address first.');
      return;
    }

    setSearchingMarkerAddress(true);
    try {
      const params = new URLSearchParams({ q: markerEditor.address.trim() });
      const response = await fetch(`/api/territory/geocode?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Address search failed');
      }

      setMarkerEditor((current) =>
        current
          ? {
              ...current,
              address: payload.formattedAddress ?? current.address,
              lat: payload.lat,
              lng: payload.lng,
            }
          : current,
      );

      onCenterLocation({ lat: payload.lat, lng: payload.lng });
      toast.success('Address found');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Address search failed');
    } finally {
      setSearchingMarkerAddress(false);
    }
  }

  async function saveMarker() {
    if (!markerEditor) {
      return;
    }

    if (!markerEditor.name.trim()) {
      toast.error('Marker name is required.');
      return;
    }

    if (markerEditor.lat === null || markerEditor.lng === null) {
      toast.error('Search an address first.');
      return;
    }

    setSavingMarker(true);
    try {
      const response = await fetch(
        markerEditor.id ? `/api/territory/markers/${markerEditor.id}` : '/api/territory/markers',
        {
          method: markerEditor.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: markerEditor.name,
            description: markerEditor.description || null,
            address: markerEditor.address || null,
            lat: markerEditor.lat,
            lng: markerEditor.lng,
            color: markerEditor.color,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to save home marker');
      }

      closeMarkerEditor();
      setShowMarkers(true);
      await queryClient.invalidateQueries({ queryKey: ['territory-markers'] });
      toast.success(markerEditor.id ? 'Home marker updated' : 'Home marker saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save home marker');
    } finally {
      setSavingMarker(false);
    }
  }

  return {
    showBoundaries,
    hiddenBoundaryIds,
    showMarkers,
    hiddenMarkerIds,
    showBoundarySheet,
    setShowBoundarySheet,
    boundaryEditor,
    setBoundaryEditor,
    drawingBoundaryMode,
    setDrawingBoundaryMode,
    savingBoundary,
    markerEditor,
    setMarkerEditor,
    savingMarker,
    searchingMarkerAddress,
    toggleBoundaryVisibility,
    toggleAllBoundaries,
    toggleMarkerVisibility,
    toggleAllMarkers,
    closeBoundaryEditor,
    closeMarkerEditor,
    startCreatingBoundary,
    startEditingBoundary,
    startCreatingMarker,
    startEditingMarker,
    deleteBoundary,
    deleteMarker,
    saveBoundary,
    searchMarkerAddress,
    saveMarker,
  };
}
